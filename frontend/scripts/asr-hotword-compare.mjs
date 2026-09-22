import { readFile, writeFile, stat } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'
import WebSocket from 'ws'

export const model = 'qwen-audio-3.1-asr-flash-streaming'

export function validateVocabulary(value) {
  if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error('热词必须是 JSON 对象')
  const entries = Object.entries(value)
  if (!entries.length || entries.length > 200) throw new Error('请提供 1—200 个热词')
  for (const [word, weight] of entries) {
    if (!word.trim() || word !== word.trim() || word.length > 80 || /[\u0000-\u001f\u007f-\u009f]/u.test(word)
      || !Number.isInteger(weight) || weight < 1 || weight > 5) throw new Error('热词最长 80 字符，权重为 1—5 的整数')
  }
  if (Buffer.byteLength(JSON.stringify(value)) > 4096) throw new Error('热词 JSON 总大小不能超过 4096 字节')
  return value
}

export function pcmFromWav(buffer) {
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('请提供 WAV 文件：PCM16、16000 Hz、单声道')
  }
  let format
  let data
  for (let offset = 12; offset + 8 <= buffer.length;) {
    const size = buffer.readUInt32LE(offset + 4)
    const end = offset + 8 + size
    if (end > buffer.length) throw new Error('WAV 文件不完整')
    const name = buffer.toString('ascii', offset, offset + 4)
    if (name === 'fmt ' && size >= 16) {
      format = [buffer.readUInt16LE(offset + 8), buffer.readUInt16LE(offset + 10),
        buffer.readUInt32LE(offset + 12), buffer.readUInt16LE(offset + 22)]
    }
    if (name === 'data') data = buffer.subarray(offset + 8, end)
    offset = end + size % 2
  }
  if (String(format) !== '1,1,16000,16' || !data?.length || data.length % 2) {
    throw new Error('请提供非空 PCM16、16000 Hz、单声道 WAV 文件')
  }
  return data
}

// No microphone access; replay the same audio in 100 ms chunks.
export function recognize({ url, apiKey, pcm, vocabulary, selectedModel = model, platform = false, timeoutMs = 180000 }) {
  return new Promise((resolve, reject) => {
    const id = randomUUID()
    const socket = new WebSocket(url, { headers: { Authorization: `Bearer ${apiKey}` }, handshakeTimeout: 10000, maxPayload: 1048576 })
    const startedAt = performance.now()
    const sentences = new Map()
    let firstTextMs = null
    let done = false
    let started = false
    let audioFinishedAt = null
    const liveTranslate = selectedModel === 'qwen3.8-livetranslate-flash-realtime' && !platform
    const controller = new AbortController()
    const timer = setTimeout(() => finish(new Error('转写超时')), timeoutMs)
    function finish(error) {
      if (done) return
      done = true
      clearTimeout(timer)
      controller.abort()
      socket.terminate()
      if (error) reject(error)
      else resolve({ model: selectedModel, hotwords: vocabulary ? Object.keys(vocabulary).length : 0,
        firstTextMs: firstTextMs === null ? null : Math.round(firstTextMs),
        finalAfterAudioMs: audioFinishedAt === null ? null : Math.round(performance.now() - audioFinishedAt),
        totalMs: Math.round(performance.now() - startedAt), text: [...sentences.values()].join('') })
    }
    function send(value) { socket.send(JSON.stringify(value)) }
    async function stream() {
      for (let offset = 0; offset < pcm.length && !done; offset += 3200) {
        const chunk = pcm.subarray(offset, offset + 3200)
        await new Promise((accept, fail) => socket.send(liveTranslate
          ? JSON.stringify({ type: 'input_audio_buffer.append', audio: chunk.toString('base64') }) : chunk,
        error => error ? fail(error) : accept()))
        await delay(chunk.length / 32, undefined, { signal: controller.signal })
      }
      if (!done) {
        audioFinishedAt = performance.now()
        send(liveTranslate ? { type: 'session.finish' } : { header: { action: 'finish-task', task_id: id, streaming: 'duplex' }, payload: { input: {} } })
      }
    }
    socket.on('open', () => {
      send(liveTranslate ? { type: 'session.update', session: { output_modalities: ['text'],
        audio: { input: { format: { type: 'pcm', sample_rate: 16000 } } }, translation: { language: 'zh' } } }
        : { header: { action: 'run-task', task_id: id, streaming: 'duplex' }, payload: {
          task_group: 'audio', task: 'asr', function: 'recognition', model: selectedModel,
          parameters: { format: 'pcm', sample_rate: 16000, semantic_punctuation_enabled: false,
            max_sentence_silence: 800, heartbeat: true, ...(vocabulary ? { vocabulary } : {}) }, input: {} } })
    })
    socket.on('message', bytes => {
      try {
        const frame = JSON.parse(bytes.toString())
        if (!liveTranslate && frame.header?.task_id !== id) return finish(new Error('转写任务 ID 不匹配'))
        const event = frame.header?.event ?? frame.type
        if (['task-failed', 'error', 'conversation.item.input_audio_transcription.failed'].includes(event)) {
          return finish(new Error('供应商或平台返回转写失败，请检查模型权限、地址、参数及服务日志'))
        }
        if (['task-started', 'session.updated'].includes(event) && !started) {
          started = true
          void stream().catch(error => { if (!done) finish(error) })
        }
        const sentence = frame.payload?.output?.sentence
        if (sentence?.text && !sentence.heartbeat) {
          firstTextMs ??= performance.now() - startedAt
          sentences.set(sentence.begin_time, sentence.text)
        }
        if (event === 'conversation.item.input_audio_transcription.delta' || event === 'conversation.item.input_audio_transcription.completed') {
          firstTextMs ??= performance.now() - startedAt
          sentences.set(frame.item_id, event.endsWith('.completed') ? frame.transcript : (sentences.get(frame.item_id) ?? '') + frame.delta)
        }
        if (['task-finished', 'session.finished'].includes(event)) {
          if (audioFinishedAt === null) return finish(new Error('音频未发送完，任务提前结束'))
          finish()
        }
      } catch { finish(new Error('转写响应格式无效')) }
    })
    socket.on('error', () => finish(new Error('WebSocket 连接失败，请检查地址、凭据和网络')))
    socket.on('close', () => { if (!done) finish(new Error('转写完成前连接断开')) })
  })
}

async function main() {
  const [file, wordsFile, output = 'asr-comparison.json'] = process.argv.slice(2)
  if (!file || !wordsFile) throw new Error('用法：node frontend/scripts/asr-hotword-compare.mjs audio.wav hotwords.json [output.json]')
  const url = new URL(process.env.ASR_TEST_URL ?? '')
  const platform = process.env.ASR_TEST_MODE === 'platform'
  const apiKey = platform ? process.env.ASR_TEST_TOKEN : process.env.DASHSCOPE_API_KEY
  if (url.protocol !== 'wss:' || url.username || url.password || !apiKey) throw new Error('需要 WSS 地址及环境变量中的凭据')
  if (!platform && (url.pathname !== '/api-ws/v1/inference' || url.search)) throw new Error('新模型直连地址应以 /api-ws/v1/inference 结尾')
  if ((await stat(file)).size > 4 * 1048576) throw new Error('测试录音请限制在 4 MiB 以内')
  const pcm = pcmFromWav(await readFile(file))
  const vocabulary = validateVocabulary(JSON.parse(await readFile(wordsFile, 'utf8')))
  const options = { url: url.toString(), apiKey, pcm, platform }
  const results = []
  if (process.env.ASR_BASELINE_URL) {
    const baseline = new URL(process.env.ASR_BASELINE_URL)
    if (baseline.protocol !== 'wss:' || baseline.username || baseline.password) throw new Error('基线模型地址必须为 WSS')
    results.push({ name: 'current-model', ...await recognize({ url: baseline.toString(),
      apiKey: process.env.ASR_BASELINE_KEY || process.env.DASHSCOPE_API_KEY,
      selectedModel: 'qwen3.8-livetranslate-flash-realtime', pcm }) })
  }
  for (const words of [undefined, vocabulary]) {
    console.log(words ? '正在测试：有热词' : '正在测试：无热词')
    results.push({ name: words ? 'with-hotwords' : 'without-hotwords', ...await recognize({ ...options, vocabulary: words ?? (platform ? {} : undefined) }) })
  }
  await writeFile(output, JSON.stringify({ audioSeconds: pcm.length / 32000, results }, null, 2), { mode: 0o600, flag: 'wx' })
  console.log(`对比结果已保存：${output}`)
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1 })
}
