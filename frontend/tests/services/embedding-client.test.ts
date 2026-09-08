import { afterEach, describe, expect, it } from 'vitest'
import { createServer, type RequestListener, type Server } from 'node:http'
import { EmbeddingClient, embeddingFingerprint } from '../../src/main/services/embedding-client'
import { defaultSettings } from '../../src/shared/defaults'

let server: Server | undefined
afterEach(async () => { server?.closeAllConnections(); if (server) await new Promise<void>((resolve) => server?.close(() => resolve())); server = undefined })
async function serve(handler: RequestListener): Promise<string> {
  server = createServer(handler)
  await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('No address')
  return `http://127.0.0.1:${address.port}/v1`
}
const config = { ...defaultSettings.embedding, dimensions: 64 }

describe('EmbeddingClient', () => {
  it('supports a complete embeddings endpoint and restores response index order', async () => {
    let pathname = ''
    let payload: unknown
    const baseUrl = await serve(async (request, response) => {
      pathname = request.url ?? ''
      const blocks = []
      for await (const block of request) blocks.push(block)
      payload = JSON.parse(Buffer.concat(blocks).toString())
      response.setHeader('Content-Type', 'application/json')
      response.end(JSON.stringify({ data: [1, 0].map((index) => ({ index, embedding: Array(64).fill(index + 1) })) }))
    })
    const result = await new EmbeddingClient({ ...config, baseUrl: `${baseUrl}/embeddings/` }, '').embed(['Redis', 'Kafka'])
    expect(pathname).toBe('/v1/embeddings')
    expect(payload).toMatchObject({ dimensions: 64, encoding_format: 'float', input: ['Redis', 'Kafka'] })
    expect(result.map((vector) => vector[0])).toEqual([1, 2])
  })

  it('rejects incompatible dimensions and never exposes provider error bodies', async () => {
    let failure = false
    const baseUrl = await serve((_request, response) => {
      response.statusCode = failure ? 401 : 200
      response.end(failure ? 'PRIVATE_PROVIDER_DETAIL' : JSON.stringify({ data: [{ index: 0, embedding: [1, 2] }] }))
    })
    const client = new EmbeddingClient({ ...config, baseUrl }, '')
    await expect(client.embed(['Redis'])).rejects.toThrow('维度')
    failure = true
    await expect(client.embed(['Redis'])).rejects.toThrow('HTTP 401')
    await expect(client.embed(['Redis'])).rejects.not.toThrow('PRIVATE_PROVIDER_DETAIL')
  })

  it('enforces the provider batch maximum before sending any request', async () => {
    const client = new EmbeddingClient({ ...config, baseUrl: 'http://127.0.0.1:1/v1' }, '')
    await expect(client.embed(Array(11).fill('Redis'))).rejects.toThrow('批次')
  })

  it.each([Number.MAX_VALUE, 1e-80, 0])('rejects vectors that become invalid Float32 values (%s)', async (value) => {
    const baseUrl = await serve((_request, response) => {
      response.end(JSON.stringify({ data: [{ index: 0, embedding: Array(64).fill(value) }] }))
    })
    await expect(new EmbeddingClient({ ...config, baseUrl }, '').embed(['Redis'])).rejects.toThrow('维度')
  })

  it('redacts connection failures and keeps dimensions and model spaces distinct', async () => {
    await expect(new EmbeddingClient({ ...config, baseUrl: 'http://127.0.0.1:1/v1' }, '').test()).rejects.toThrow('向量服务连接失败')
    expect(embeddingFingerprint(config)).not.toBe(embeddingFingerprint({ ...config, dimensions: 128 }))
    expect(embeddingFingerprint(config)).not.toBe(embeddingFingerprint({ ...config, model: 'other-model' }))
  })
})
