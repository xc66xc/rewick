import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import MagicMock, patch
import wave

spec = importlib.util.spec_from_file_location(
    "review", Path(__file__).with_name("recording-review.py")
)
review = importlib.util.module_from_spec(spec)
spec.loader.exec_module(review)


class ReviewTests(unittest.TestCase):
    def test_local_model_load_disables_download_and_uses_cpu(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            for name in ["model.bin", "config.json", "tokenizer.json", "vocabulary.txt"]:
                (Path(folder) / name).touch()
            factory = MagicMock()
            with patch.dict("sys.modules", {"faster_whisper": SimpleNamespace(WhisperModel=factory)}):
                review.load_local_model({"modelPath": folder})
            options = factory.call_args.kwargs
            self.assertTrue(options["local_files_only"])
            self.assertEqual(options["device"], "cpu")
            self.assertEqual(options["compute_type"], "int8")
            self.assertEqual(os.environ["ORT_DISABLE_TELEMETRY"], "1")
            self.assertLessEqual(options["cpu_threads"], 4)

    def make_audio(self, path: Path, seconds: int) -> None:
        with wave.open(str(path), "wb") as wav:
            wav.setparams((1, 2, 16000, 0, "NONE", "not compressed"))
            chunk = bytes(120 * 32000)
            while seconds:
                count = min(seconds, 120)
                wav.writeframesraw(chunk[:count * 32000])
                seconds -= count

    def test_two_hour_audio_is_processed_locally_and_only_text_is_sent(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            audio = Path(folder) / "two-hours.wav"
            output = Path(folder) / "review.md"
            self.make_audio(audio, 7200)
            sizes = []

            def recognize(model, pcm):
                sizes.append(len(pcm))
                return "面试实录"

            with patch.object(review, "load_local_model", return_value=object()):
                with patch.object(review, "recognize_chunk", side_effect=recognize):
                    with patch.object(review, "request", return_value={"markdown": "# 复盘"}) as http:
                        with patch("sys.stdout", io.StringIO()):
                            review.run({"audioPath": str(audio), "outputPath": str(output)})
            self.assertEqual(audio.stat().st_size, 230400044)
            self.assertEqual(sizes, [3840000] * 60)
            http.assert_called_once()
            body = json.loads(http.call_args.args[1])
            self.assertEqual(set(body), {"transcript"})
            self.assertIn("面试实录", body["transcript"])
            self.assertEqual(output.read_text(encoding="utf-8"), "# 复盘")

    def test_last_local_chunk_is_not_dropped(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            audio = Path(folder) / "audio.wav"
            self.make_audio(audio, 121)
            with patch.object(review, "load_local_model", return_value=object()):
                with patch.object(review, "recognize_chunk", return_value="真实内容") as local:
                    with patch("sys.stdout", io.StringIO()):
                        result = review.transcribe_local({"audioPath": str(audio)})
            self.assertEqual([len(c.args[1]) for c in local.call_args_list], [3840000, 32000])
            self.assertIn("[02:00] 真实内容", result)

    def test_empty_recording_fails_before_loading_or_network(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            audio = Path(folder) / "audio.wav"
            self.make_audio(audio, 0)
            with patch.object(review, "request") as http:
                with patch.object(review, "load_local_model") as load:
                    with self.assertRaises(ValueError):
                        review.run({"audioPath": str(audio)})
                    load.assert_not_called()
                http.assert_not_called()

    def test_missing_model_never_falls_back_to_cloud_asr(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            audio = Path(folder) / "audio.wav"
            self.make_audio(audio, 1)
            with patch.object(review, "request") as http:
                with patch("sys.stdout", io.StringIO()):
                    with self.assertRaisesRegex(ValueError, "缺少本地语音模型"):
                        review.run({"audioPath": str(audio), "modelPath": folder})
                http.assert_not_called()

    def test_summary_requests_are_json_text_to_summary_endpoint_only(self) -> None:
        for address in ["http://101.33.245.166:8080", "http://[2001:db8::1]:8080",
                        "http://localhost:18080", "https://api.junshi.icu"]:
            with self.subTest(address=address):
                response = MagicMock()
                response.__enter__.return_value.read.return_value = b'{"markdown":"ok"}'
                with patch.object(review.urllib.request, "build_opener") as factory:
                    factory.return_value.open.return_value = response
                    review.summarize({"baseUrl": address, "token": "test"}, "实录")
                    req = factory.return_value.open.call_args.args[0]
                    self.assertEqual(req.full_url, address + "/api/v1/recording-reviews/summarize")
                    self.assertEqual(req.get_header("Content-type"), "application/json")
                    self.assertEqual(json.loads(req.data), {"transcript": "实录"})

    def test_unsafe_addresses_fail_before_network(self) -> None:
        for address in ["http://example.com", "http://999.1.1.1",
                        "https://user:password@example.com", "https://example.com?token=x",
                        "https://example.com#fragment", "file:///tmp/audio.wav"]:
            with self.subTest(address=address):
                with patch.object(review.urllib.request, "build_opener") as factory:
                    with self.assertRaises(ValueError):
                        review.summarize({"baseUrl": address, "token": "test"}, "实录")
                    factory.assert_not_called()


if __name__ == "__main__":
    unittest.main()
