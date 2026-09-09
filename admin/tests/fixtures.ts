import type { Config, User } from '../src/types'
export const user: User = { id: '2', username: 'candidate', role: 'USER', enabled: true, dailyAnswers: 20, dailyKnowledgeQueries: 30, createdAt: '2026-09-08T08:00:00Z' }
export const config: Config = { version: 1, providers: [{ id: 'service-1', name: '回答服务', kind: 'llm', enabled: true, url: 'https://provider.example/v1/chat/completions', hasApiKey: true }], models: [{ id: 'model-1', name: '快速模型', providerId: 'service-1', model: 'fast-model', enabled: true, maxOutputTokens: 1024 }], defaultModelId: 'model-1', asr: { enabled: false, providerId: '', model: '' }, knowledge: { enabled: false, providerId: '', agentId: '' }, embedding: { enabled: false, providerId: '', model: '', dimensions: 512 } }
export function response(value: unknown, status = 200) { return Response.json(value, { status }) }
export function page<T>(items: T[], total = items.length, pageNumber = 1) { return { items, total, page: pageNumber, size: 20 } }
export function data(options?: RequestInit): Record<string, unknown> { return JSON.parse(String(options?.body ?? '{}')) as Record<string, unknown> }
