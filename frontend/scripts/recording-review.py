"""Local WAV -> offline speech recognition -> text-only platform review.

Credentials arrive only over stdin. Audio is read one bounded chunk at a time.
No automatic HTTP retries: each request may be billed.
"""
import ipaddress
import json
import math
import os
from pathlib import Path
import sys
import ssl
import urllib.error
import urllib.parse
import urllib.request
import wave

CHUNK_SECONDS = 120
TEXT_LIMIT = 24000


def emit(kind: str, **values) -> None:
    print(json.dumps({"type": kind, **values}, ensure_ascii=False), flush=True)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError("服务重定向被拒绝，请检查平台地址。")


def platform_base_url(value: str) -> str:
    """Match the desktop's explicit-IP HTTP transport policy."""
    base = value.strip().rstrip("/")
    parsed = urllib.parse.urlsplit(base)
    if not parsed.hostname:
        raise ValueError("平台地址无效。")
    if parsed.username or parsed.password or "?" in base or "#" in base:
        raise ValueError("平台地址不能包含账号、密码、查询参数或片段。")
    try:
        ipaddress.ip_address(parsed.hostname)
        explicit_ip = True
    except ValueError:
        explicit_ip = False
    if parsed.scheme != "https" and not (
        parsed.scheme == "http" and (explicit_ip or parsed.hostname == "localhost")
    ):
        raise ValueError("平台域名必须使用 HTTPS；显式 IP 地址或 localhost 允许 HTTP。")
    # Accessing port validates its numeric value and range before sending credentials.
    _ = parsed.port
    return base


def request(config: dict, payload: bytes) -> dict:
    base = platform_base_url(config["baseUrl"])
    req = urllib.request.Request(
        base + "/api/v1/recording-reviews/summarize",
        data=payload,
        headers={"Authorization": "Bearer " + config["token"],
                 "Content-Type": "application/json"},
        method="POST",
    )
    try:
        ca_file = Path(sys.executable).resolve().parent / "cacert.pem"
        if not ca_file.exists():
            ca_file = Path(sys.executable).resolve().parent.parent / "cacert.pem"
        context = ssl.create_default_context(cafile=str(ca_file) if ca_file.exists() else None)
        opener = urllib.request.build_opener(NoRedirect, urllib.request.HTTPSHandler(context=context))
        with opener.open(req, timeout=240) as response:
            data = response.read(2_000_001)
            if len(data) > 2_000_000:
                raise ValueError("复盘服务响应过大。")
            return json.loads(data)
    except urllib.error.HTTPError as error:
        if error.code == 413:
            raise ValueError("复盘文字超过服务端大小限制，请缩短内容后重试。") from None
        raise ValueError(f"复盘服务请求失败（HTTP {error.code}），请检查模型配置。") from None
    except (urllib.error.URLError, TimeoutError):
        raise ValueError("复盘服务连接失败或超时，请稍后重试。") from None


def summarize(config: dict, text: str) -> str:
    result = request(config, json.dumps(
        {"transcript": text}, ensure_ascii=False
    ).encode("utf-8"))
    markdown = result.get("markdown")
    if not isinstance(markdown, str) or not markdown.strip():
        raise ValueError("复盘模型未返回内容。")
    return markdown


def load_local_model(config: dict):
    model_path = Path(config.get("modelPath", ""))
    required = ["model.bin", "config.json", "tokenizer.json", "vocabulary.txt"]
    if not all((model_path / name).is_file() for name in required):
        raise ValueError("缺少本地语音模型，请安装包含离线识别模型的新版客户端。")
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
    try:
        from faster_whisper import WhisperModel
        return WhisperModel(
            str(model_path.resolve()), device="cpu", compute_type="int8",
            cpu_threads=max(1, min(4, os.cpu_count() or 1)),
            local_files_only=True,
        )
    except (ImportError, OSError, RuntimeError, ValueError):
        raise ValueError("本地语音识别环境加载失败，请重新安装完整客户端。") from None


def recognize_chunk(model, pcm: bytes) -> str:
    import numpy as np
    audio = np.frombuffer(pcm, dtype="<i2").astype(np.float32) / 32768.0
    segments, _ = model.transcribe(
        audio, language="zh", task="transcribe", beam_size=5,
        condition_on_previous_text=False, vad_filter=True,
    )
    parts = []
    length = 0
    for segment in segments:
        length += len(segment.text)
        if length > 24000:
            raise ValueError("单段转写内容超出处理上限。")
        parts.append(segment.text.strip())
    return " ".join(parts).strip()


def transcribe_local(config: dict) -> str:
    texts = []
    total_characters = 0
    with wave.open(config["audioPath"], "rb") as recording:
        if (recording.getnchannels(), recording.getsampwidth(),
                recording.getframerate(), recording.getcomptype()) != (1, 2, 16000, "NONE"):
            raise ValueError("录音必须是 16kHz 单声道 PCM16 WAV。")
        duration = recording.getnframes() / 16000
        if not 0 < duration <= 4 * 3600:
            raise ValueError("录音为空或超过 4 小时。")
        total = math.ceil(duration / CHUNK_SECONDS)
        emit("progress", stage="transcribing", completed=0, total=total)
        model = load_local_model(config)
        for index in range(total):
            pcm = recording.readframes(CHUNK_SECONDS * 16000)
            text = recognize_chunk(model, pcm)
            total_characters += len(text)
            if len(text) > 24000 or total_characters > 500000:
                raise ValueError("转写内容超出处理上限，请缩短录音后重试。")
            if text.strip():
                texts.append(f"[{index * CHUNK_SECONDS // 60:02d}:00] {text.strip()}")
            emit("progress", stage="transcribing", completed=index + 1, total=total)
    if not texts:
        raise ValueError("录音中未识别到有效语音。")
    return "\n".join(texts)


def run(config: dict) -> None:
    transcript = transcribe_local(config)
    # Hierarchical reduction prevents a long interview exceeding model input limits.
    passes = 0
    while len(transcript) > TEXT_LIMIT:
        passes += 1
        if passes > 4:
            raise ValueError("复盘内容过长，已停止继续调用模型。")
        pieces = [transcript[i:i + TEXT_LIMIT] for i in range(0, len(transcript), TEXT_LIMIT)]
        summaries = []
        for index, piece in enumerate(pieces):
            emit("progress", stage="summarizing", completed=index, total=len(pieces) + 1)
            summaries.append(summarize(config, "以下是面试实录的一部分，请保留证据及不确定性：\n" + piece))
        reduced = "\n\n".join(summaries)
        if len(reduced) >= len(transcript):
            raise ValueError("分段复盘未有效压缩，请调整复盘模型后重试。")
        transcript = reduced
    emit("progress", stage="summarizing", completed=0, total=1)
    markdown = summarize(config, transcript)
    emit("progress", stage="exporting", completed=0, total=1)
    output = Path(config["outputPath"])
    temporary = output.with_name(output.name + ".rewick-part")
    try:
        temporary.write_text(markdown, encoding="utf-8")
        os.replace(temporary, output)
    finally:
        temporary.unlink(missing_ok=True)
    emit("progress", stage="exporting", completed=1, total=1)
    emit("result")


if __name__ == "__main__":
    try:
        run(json.load(sys.stdin))
    except ValueError as error:
        emit("error", message=str(error))
        sys.exit(1)
    except Exception:
        emit("error", message="面试复盘失败，请检查本地识别环境、录音、磁盘空间和平台连接。")
        sys.exit(1)
