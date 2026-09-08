import http from 'node:http'

export const remoteMarker = 'REMOTE_KNOWLEDGE_ONLY_87'
export const providerPrivateError = 'PROVIDER_PRIVATE_ERROR_MUST_NOT_APPEAR_63'
export const remoteMetadataMarkers = {
  documentName: 'PROVIDER_DOCUMENT_NAME_MUST_NOT_APPEAR_71',
  documentId: 'PROVIDER_DOCUMENT_ID_MUST_NOT_APPEAR_72',
  nodeId: 'PROVIDER_NODE_ID_MUST_NOT_APPEAR_73',
  pipelineId: 'PROVIDER_PIPELINE_ID_MUST_NOT_APPEAR_74',
  documentType: 'PROVIDER_DOCUMENT_TYPE_MUST_NOT_APPEAR_75',
  score: 0.9371548620937615,
  nodeScore: 0.8261437591826504,
}

/** A local implementation of the published retrieval response envelope; never contacts a provider. */
export async function startRemoteKnowledgeMock() {
  const requests = []
  const unexpectedRequests = []
  const sockets = new Set()
  const held = new Map()
  let mode = 'ready'
  const server = http.createServer(async (request, response) => {
    if (request.method !== 'POST' || request.url !== '/knowledge/search') {
      unexpectedRequests.push({ method: request.method, url: request.url })
      response.writeHead(404).end()
      return
    }
    let body
    try {
      let text = ''
      for await (const chunk of request) text += chunk
      body = JSON.parse(text)
    } catch { response.writeHead(400).end(); return }
    const record = { body, method: request.method, path: request.url, authorization: request.headers.authorization,
      mode, completed: false, cancelled: false }
    const index = requests.push(record) - 1
    response.on('close', () => {
      if (!record.completed) record.cancelled = true
      held.delete(index)
    })
    const respond = () => {
      held.delete(index)
      if (response.destroyed) return
      let status = 200
      let result
      if (record.mode === 'http-error') {
        status = 503
        result = { message: providerPrivateError }
      } else if (record.mode === 'business-error') {
        result = { success: false, code: 'InternalError', message: providerPrivateError,
          status: 'FAILED', status_code: 500, data: null }
      } else {
        const count = ['many', 'large'].includes(record.mode) ? 9 : record.mode === 'empty' ? 0 : 2
        const nodes = Array.from({ length: count }, (_, node) => ({
          _id: `${remoteMetadataMarkers.nodeId}-top-level-${node}`,
          score: remoteMetadataMarkers.nodeScore,
          text: `${remoteMarker} · 片段 ${node + 1}。本次问题：${body.query}。`
            + (record.mode === 'many' ? '合成 Redis 缓存技术参考。'.repeat(45)
              : record.mode === 'large' ? '合成超长远程内容。'.repeat(350) : '合成知识：先定位慢查询，再验证缓存一致性。'),
          metadata: { doc_name: `${remoteMetadataMarkers.documentName} ${body.agent_id} ${node + 1}`,
            doc_id: `${remoteMetadataMarkers.documentId}-${node}`, pipeline_id: remoteMetadataMarkers.pipelineId,
            _id: `${remoteMetadataMarkers.nodeId}-${node}`, doc_type: remoteMetadataMarkers.documentType,
            score: remoteMetadataMarkers.score, page_number: [37, 38],
            url: `http://127.0.0.1:${server.address().port}/must-not-fetch` },
        }))
        result = { success: true, code: 'Success', status: 'SUCCESS', status_code: 200, data: { nodes } }
      }
      record.completed = true
      record.response = result
      response.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(result))
    }
    if (record.mode === 'timeout') return
    if (record.mode === 'held') { held.set(index, respond); return }
    respond()
  })
  server.on('connection', socket => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  return {
    url: `http://127.0.0.1:${server.address().port}/knowledge/search`, requests, unexpectedRequests,
    setMode(value) {
      if (!['ready', 'empty', 'http-error', 'business-error', 'timeout', 'held', 'many', 'large'].includes(value)) {
        throw new Error(`Unsupported remote mock mode: ${value}`)
      }
      mode = value
    },
    isHeld(index) { return held.has(index) },
    release(index) { const respond = held.get(index); if (!respond) return false; respond(); return true },
    async close() {
      for (const socket of sockets) socket.destroy()
      await new Promise(resolve => server.close(resolve))
    },
  }
}
