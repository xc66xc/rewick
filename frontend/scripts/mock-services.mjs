import http from 'node:http'
import { pathToFileURL } from 'node:url'
import { WebSocket, WebSocketServer } from 'ws'
import { mockAuthHandler } from './mock-auth.mjs'

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

function mockEmbedding(text, dimensions) {
  const vector = Array(dimensions).fill(0)
  const topics = [/redis|cache|缓存|一致性|失效|热点/i, /sql|mysql|query|查询|索引|数据库/i,
    /kafka|queue|消息|队列/i, /deploy|kubernetes|发布|部署|容器/i, /resume|candidate|简历|经历/i]
  for (let index = 0; index < topics.length; index += 1) {
    if (topics[index].test(text)) vector[index % dimensions] += 1
  }
  vector[dimensions - 1] += vector.some(value => value > 0) ? 0.05 : 1
  const length = Math.hypot(...vector)
  return vector.map(value => value / length)
}

/** Local-only provider doubles. No audio or credentials are sent outside this process. */
export async function startMockServices() {
  const requests = []
  const embeddingRequests = []
  let embeddingMode = 'fast'
  const asrConnections = []
  const asrControls = []
  const streamControls = new Map()
  const sockets = new Set()
  const stats = { cancelledStreams: 0 }
  const handleAuth = mockAuthHandler()
  const server = http.createServer(async (request, response) => {
    if (await handleAuth(request, response)) return
    if (request.method !== 'POST' || !['/v1/chat/completions', '/v1/embeddings'].includes(request.url)) {
      response.writeHead(404).end('Not found')
      return
    }

    let body
    try {
      let raw = ''
      for await (const chunk of request) raw += chunk
      body = JSON.parse(raw)
    } catch {
      response.writeHead(400, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({ error: { message: 'Invalid JSON' } }))
      return
    }

    const record = {
      body,
      authorization: request.headers.authorization,
      completed: false,
      cancelled: false,
    }
    if (request.url === '/v1/embeddings') {
      embeddingRequests.push(record)
      response.on('close', () => { if (!record.completed) record.cancelled = true })
      if (embeddingMode === 'timeout') return
      if (embeddingMode === 'error') {
        record.completed = true
        response.writeHead(503, { 'Content-Type': 'application/json' })
        response.end(JSON.stringify({ error: { message: '模拟向量服务暂时不可用' } }))
        return
      }
      const inputs = typeof body.input === 'string' ? [body.input] : body.input
      const dimensions = body.dimensions ?? 1024
      if (!Array.isArray(inputs) || !inputs.every(value => typeof value === 'string')
        || !Number.isInteger(dimensions) || dimensions < 1 || dimensions > 4096) {
        record.completed = true
        response.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: { message: 'Invalid embedding input' } }))
        return
      }
      record.completed = true
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({ object: 'list', model: body.model,
        data: inputs.map((value, index) => ({ object: 'embedding', index, embedding: mockEmbedding(value, dimensions) })),
        usage: { prompt_tokens: inputs.join('').length, total_tokens: inputs.join('').length } }))
      return
    }
    const requestIndex = requests.push(record) - 1
    if (body.model === 'mock-error') {
      response.writeHead(401, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({ error: { message: '模拟 API Key 无效，请检查配置。' } }))
      return
    }

    if (!body.stream) {
      response.writeHead(200, { 'Content-Type': 'application/json' })
      record.completed = true
      response.end(JSON.stringify({
        id: 'mock-connection-check',
        object: 'chat.completion',
        choices: [{ index: 0, message: { role: 'assistant', content: '连接成功' }, finish_reason: 'stop' }],
      }))
      return
    }

    response.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    })
    response.flushHeaders()
    let disconnected = false
    response.on('close', () => {
      disconnected = true
      if (!record.completed) {
        record.cancelled = true
        stats.cancelledStreams += 1
      }
      streamControls.get(requestIndex)?.()
      streamControls.delete(requestIndex)
    })

    const slow = body.model === 'mock-slow'
    const held = body.model === 'mock-held'
    const deltas = slow || held
      ? ['我会先确认', '性能瓶颈。', ...(slow ? Array.from({ length: 80 }, () => '接着我会继续排查。') : [])]
      : ['我之前做过订单系统。', '遇到慢查询时，', '我一般会先看慢查询日志，确认是哪条 SQL 慢。',
        '\n\n接着我会结合执行计划检查索引和扫描行数，', '再用实际查询验证优化有没有效果。']
    response.write(': mock provider heartbeat\n\n')
    for (const delta of deltas) {
      if (disconnected) return
      const event = Buffer.from(`data: ${JSON.stringify({
        id: 'mock-answer',
        object: 'chat.completion.chunk',
        choices: [{ index: 0, delta: { content: delta }, finish_reason: null }],
      })}\n\n`)
      // Exercise an actual UTF-8 boundary, not just separate complete SSE records.
      const firstMultibyte = event.findIndex((byte) => byte >= 0xc0)
      const boundary = firstMultibyte === -1 ? Math.floor(event.length / 2) : firstMultibyte + 1
      response.write(event.subarray(0, boundary))
      await sleep(4)
      if (disconnected) return
      response.write(event.subarray(boundary))
      await sleep(slow ? 180 : 35)
    }
    if (held && !disconnected) {
      await new Promise((resolve) => streamControls.set(requestIndex, resolve))
      streamControls.delete(requestIndex)
    }
    if (!disconnected) {
      record.completed = true
      response.end('data: [DONE]\n\n')
    }
  })

  server.on('connection', (socket) => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
  })

  const websocketServer = new WebSocketServer({ server })
  websocketServer.on('connection', (socket, request) => {
    const mode = new URL(request.url, 'http://localhost').searchParams.get('mode')
    const record = {
      url: request.url,
      authorization: request.headers.authorization,
      commands: [],
      audioBytes: 0,
      audioMessages: 0,
      hasNonzeroPcm: false,
      finished: false,
      closed: false,
      taskId: undefined,
    }
    asrConnections.push(record)
    const emit = (event, payload = {}) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ header: { event, task_id: record.taskId }, payload }))
      }
    }
    const sentence = (sentenceId, text, isFinal, endMs = (sentenceId + 1) * 1000, omitSentenceEnd = false) => emit('result-generated', {
      output: {
        sentence: {
          sentence_id: sentenceId,
          begin_time: sentenceId * 1000,
          end_time: isFinal ? endMs : null,
          text,
          ...(omitSentenceEnd ? {} : { sentence_end: isFinal }),
          words: [],
        },
      },
      usage: { duration: 1 },
    })
    asrControls.push((value) => {
      if (socket.readyState !== WebSocket.OPEN || !record.taskId) throw new Error('Mock ASR task is not ready')
      sentence(value.sentenceId, value.text, value.isFinal, value.endMs, value.omitSentenceEnd)
    })

    socket.on('message', (data, isBinary) => {
      if (isBinary) {
        record.audioBytes += data.byteLength
        record.audioMessages += 1
        record.hasNonzeroPcm ||= data.some((byte) => byte !== 0)
        if (mode !== 'manual' && record.audioMessages === 1) sentence(0, '请介绍你做过的', false)
        if (mode !== 'manual' && record.audioMessages === 2) {
          sentence(0, '请介绍你做过的项目。', true)
          sentence(1, '你如何排查慢查询', false)
        }
        return
      }
      let command
      try { command = JSON.parse(data.toString()) } catch { return }
      record.commands.push(command)
      if (command.header?.action === 'run-task') {
        record.taskId = command.header.task_id
        if (mode === 'error') {
          socket.send(JSON.stringify({
            header: {
              event: 'task-failed',
              task_id: record.taskId,
              error_code: 'InvalidApiKey',
              error_message: '模拟转写鉴权失败',
            },
            payload: {},
          }))
        } else {
          emit('task-started', {})
        }
      }
      if (command.header?.action === 'finish-task') {
        record.finished = true
        // The final correction deliberately arrives only after finish-task.
        if (mode !== 'manual') sentence(1, '你如何排查慢查询？', true)
        emit('task-finished', { usage: { duration: 2 } })
      }
    })
    socket.on('close', () => { record.closed = true })
  })

  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const { port } = server.address()
  return {
    llmBaseUrl: `http://127.0.0.1:${port}/v1`,
    asrUrl: `ws://127.0.0.1:${port}/asr`,
    requests,
    embeddingRequests,
    asrConnections,
    stats,
    setEmbeddingMode(mode) {
      if (!['fast', 'timeout', 'error'].includes(mode)) throw new Error(`Unknown mock embedding mode: ${mode}`)
      embeddingMode = mode
    },
    finishStream(requestIndex) {
      const finish = streamControls.get(requestIndex)
      if (!finish) throw new Error(`Mock stream ${requestIndex} is not waiting for completion`)
      finish()
    },
    isStreamHeld(requestIndex) { return streamControls.has(requestIndex) },
    sendSentence(connectionIndex, value) {
      const send = asrControls[connectionIndex]
      if (!send) throw new Error(`Unknown mock ASR connection ${connectionIndex}`)
      send(value)
    },
    sendFunAsrSentence(connectionIndex, { sentenceId, text, endMs }) {
      const send = asrControls[connectionIndex]
      if (!send) throw new Error(`Unknown mock ASR connection ${connectionIndex}`)
      // Fun-ASR can provide end_time without the optional sentence_end field.
      send({ sentenceId, text, endMs, isFinal: Number.isFinite(endMs), omitSentenceEnd: true })
    },
    async close() {
      for (const socket of websocketServer.clients) socket.terminate()
      for (const socket of sockets) socket.destroy()
      await new Promise((resolve) => websocketServer.close(resolve))
      await new Promise((resolve) => server.close(resolve))
    },
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const mock = await startMockServices()
  console.log(JSON.stringify({ llmBaseUrl: mock.llmBaseUrl, asrUrl: mock.asrUrl }, null, 2))
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, async () => { await mock.close(); process.exit(0) })
  }
}
