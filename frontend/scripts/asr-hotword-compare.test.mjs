import { test } from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { WebSocketServer } from 'ws'
import { recognize, validateVocabulary, pcmFromWav, model } from './asr-hotword-compare.mjs'

test('vocabulary accepts weighted terms and rejects invalid input', () => {
  assert.deepEqual(validateVocabulary({ Agent: 3, 虚拟量测: 4 }), { Agent: 3, 虚拟量测: 4 })
  for (const value of [null, [], {}, { Agent: 50 }, { Agent: 0 }, { Agent: 1.5 }, { ' ': 3 }]) {
    assert.throws(() => validateVocabulary(value))
  }
})

test('WAV parser reads PCM data and rejects wrong sample rates', () => {
  const wav = Buffer.alloc(364)
  wav.write('RIFF'); wav.writeUInt32LE(356, 4); wav.write('WAVEfmt ', 8)
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22)
  wav.writeUInt32LE(16000, 24); wav.writeUInt16LE(16, 34)
  wav.write('data', 36); wav.writeUInt32LE(320, 40)
  assert.equal(pcmFromWav(wav).length, 320)
  wav.writeUInt32LE(48000, 24)
  assert.throws(() => pcmFromWav(wav))
})

test('streams after task started, retains final text and forwards vocabulary', async () => {
  const server = new WebSocketServer({ port: 0 })
  await once(server, 'listening')
  let start
  let audioBytes = 0
  server.on('connection', socket => socket.on('message', (bytes, binary) => {
    if (binary) { audioBytes += bytes.length; return }
    const frame = JSON.parse(bytes)
    if (frame.header.action === 'run-task') {
      start = frame
      socket.send(JSON.stringify({ header: { event: 'task-started', task_id: frame.header.task_id } }))
    } else {
      for (const [text, ended] of [['虚拟量测 a检', false], ['虚拟量测 Agent', true]]) {
        socket.send(JSON.stringify({ header: { event: 'result-generated', task_id: frame.header.task_id },
          payload: { output: { sentence: { begin_time: 0, text, sentence_end: ended } } } }))
      }
      socket.send(JSON.stringify({ header: { event: 'task-finished', task_id: frame.header.task_id } }))
    }
  }))
  try {
    const result = await recognize({ url: `ws://127.0.0.1:${server.address().port}`, apiKey: 'fixture',
      pcm: Buffer.alloc(3200), vocabulary: { Agent: 3 } })
    assert.equal(start.payload.model, model)
    assert.deepEqual(start.payload.parameters.vocabulary, { Agent: 3 })
    assert.equal(audioBytes, 3200)
    assert.equal(result.text, '虚拟量测 Agent')
    assert.ok(result.firstTextMs >= 0)
  } finally {
    for (const socket of server.clients) socket.terminate()
    await new Promise(resolve => server.close(resolve))
  }
})

test('timeout and provider failure terminate the socket', async () => {
  for (const fail of [false, true]) {
    const server = new WebSocketServer({ port: 0 })
    await once(server, 'listening')
    server.on('connection', socket => socket.on('message', bytes => {
      const frame = JSON.parse(bytes)
      if (fail) socket.send(JSON.stringify({ header: { event: 'task-failed', task_id: frame.header.task_id } }))
    }))
    try {
      await assert.rejects(recognize({ url: `ws://127.0.0.1:${server.address().port}`, apiKey: 'fixture',
        pcm: Buffer.alloc(320), timeoutMs: 150 }), fail ? /转写失败/ : /超时/)
    } finally {
      for (const socket of server.clients) socket.terminate()
      await new Promise(resolve => server.close(resolve))
    }
  }
})
