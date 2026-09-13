import { Agent as HttpsAgent } from 'node:https'
import { Agent, setGlobalDispatcher } from 'undici'

// TLS session resumption is reset by the current network path. Keep HTTPS and
// certificate verification, but perform a full handshake for new connections.
// Existing HTTP keep-alive connections can still be reused.
export const websocketHttpsAgent = new HttpsAgent({ maxCachedSessions: 0 })

export function initializeNetworkTransport(): void {
  setGlobalDispatcher(new Agent({ connect: { maxCachedSessions: 0 } }))
}
