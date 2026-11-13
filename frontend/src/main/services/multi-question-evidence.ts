import { createHash } from 'node:crypto'
import type { ExtractedQuestion } from '../../shared/question-rewrite'
import type { QueryRetrieval, ReferenceExcerpt, RetrievalContext } from '../../shared/types'

function message(values: (string | undefined)[]): string | undefined {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].join(' ').slice(0, 2000) || undefined
}
function evidenceKey(excerpt: ReferenceExcerpt, question: ExtractedQuestion): string {
  if (excerpt.generatedSummary) return `summary:${excerpt.name}:${question.question}:${excerpt.text}`
  const url = new URL(excerpt.url ?? '')
  url.hash = ''
  return `page:${url.href}:${excerpt.paragraphStart ?? ''}:${excerpt.paragraphEnd ?? ''}:${excerpt.text}`
}
function status(values: RetrievalContext['status'][], count: number): RetrievalContext['status'] {
  return values.includes('degraded') ? 'degraded' : count ? 'ready' : values.every(value => value === 'disabled') ? 'disabled' : 'empty'
}

function prefix(excerpt: ReferenceExcerpt, budget: number): ReferenceExcerpt {
  if (excerpt.text.length <= budget) return excerpt
  let text = excerpt.text.slice(0, budget)
  // UTF-16 limits match the wire/storage budget; never cut a supplementary character in half.
  if (/[\uD800-\uDBFF]$/.test(text)) text = text.slice(0, -1)
  const partial = { ...excerpt, text, contextExpansion: 'partial' as const }
  // A text prefix cannot truthfully retain the original complete paragraph range.
  delete partial.paragraphStart
  delete partial.paragraphEnd
  return partial
}

/** A URL is not a content identity. Allocate first coverage fairly and key only the text actually included. */
export function aggregateQuestionEvidence(questions: ExtractedQuestion[], references: RetrievalContext | undefined,
  webResults: ReadonlyMap<string, RetrievalContext>, webEnabled: boolean, timedOut: boolean): RetrievalContext {
  const excerpts: ReferenceExcerpt[] = [...references?.excerpts ?? []]
  const selectedWeb = new Map<string, ReferenceExcerpt>()
  const limited = new Set<string>()
  const included = new Set<string>()
  let remaining = 8000
  const webRows = questions.map(question => ({ question, rows: webResults.get(question.id)?.excerpts ?? [] }))
  const eligibleCount = webRows.filter(row => row.rows.some(excerpt => excerpt.text.trim())).length
  const share = eligibleCount ? Math.min(2000, Math.floor(8000 / eligibleCount)) : 0
  const include = (candidate: ReferenceExcerpt, question: ExtractedQuestion, allowance: number, crop: boolean): boolean => {
    const original = evidenceKey(candidate, question)
    const identity = `${question.id}:${original}`
    if (included.has(identity)) return true
    const duplicate = selectedWeb.get(original)
    if (duplicate) {
      duplicate.questionIds = [...new Set([...(duplicate.questionIds ?? []), question.id])]
      included.add(identity)
      return true
    }
    const budget = Math.min(remaining, allowance, 2000)
    if (!candidate.text.trim() || budget <= 0 || !crop && candidate.text.length > budget || excerpts.length >= 61) { limited.add(question.id); return false }
    const actual = prefix(candidate, budget)
    if (!actual.text.trim()) { limited.add(question.id); return false }
    const key = evidenceKey(actual, question)
    const existing = selectedWeb.get(key)
    if (existing) existing.questionIds = [...new Set([...(existing.questionIds ?? []), question.id])]
    else {
      const excerpt = { ...actual, excerptId: `web-${createHash('sha256').update(key).digest('hex')}`, questionIds: [question.id] }
      remaining -= excerpt.text.length
      selectedWeb.set(key, excerpt)
      excerpts.push(excerpt)
    }
    included.add(identity)
    if (actual.text !== candidate.text) limited.add(question.id)
    return true
  }
  for (const { question, rows } of webRows) {
    for (const candidate of rows) if (include(candidate, question, share, true)) break
  }
  const rounds = Math.max(0, ...webRows.map(row => row.rows.length))
  for (let round = 0; round < rounds; round++) for (const { question, rows } of webRows) {
    const candidate = rows[round]
    if (!candidate) continue
    include(candidate, question, 2000, false)
  }
  const queries: QueryRetrieval[] = questions.map(question => {
    const reference = references?.queries?.find(query => query.questionId === question.id)
    const referenceStatus = reference?.status ?? 'degraded'
    const missingMessage = timedOut ? '本轮检索预算已用尽，未完成的检索已停止。' : '此问题的资料检索暂不可用。'
    const incomingWeb = webResults.get(question.id)
    const web = webEnabled ? incomingWeb?.web ?? { status: 'degraded' as const, message: missingMessage } : undefined
    const budgetMessage = limited.has(question.id) ? '部分联网候选因整轮材料预算被截取或未送入模型。' : undefined
    const sentIds = excerpts.filter(excerpt => excerpt.questionIds?.includes(question.id)).flatMap(excerpt => excerpt.excerptId ? [excerpt.excerptId] : [])
    const selectedWebStatus = budgetMessage && web ? { status: 'degraded' as const, message: message([web.message, budgetMessage]) } : web
    const combinedStatus = status([referenceStatus, ...(selectedWebStatus ? [selectedWebStatus.status] : [])], sentIds.length)
    return { questionId: question.id, status: combinedStatus, referenceStatus, excerptIds: sentIds,
      ...(reference?.hybrid ? { hybrid: reference.hybrid } : {}), ...(selectedWebStatus ? { web: selectedWebStatus } : {}),
      ...(message([reference?.message ?? (!reference ? missingMessage : undefined), selectedWebStatus?.message]) ? { message: message([reference?.message ?? (!reference ? missingMessage : undefined), selectedWebStatus?.message]) } : {}) }
  })
  const webStates = queries.flatMap(query => query.web ? [query.web] : [])
  return { status: status(queries.map(query => query.status), excerpts.length), excerpts, queries,
    ...(references?.policyVersion !== undefined ? { policyVersion: references.policyVersion } : {}),
    ...(references?.platformVersion !== undefined ? { platformVersion: references.platformVersion } : {}),
    ...(message([references?.message, ...queries.map(query => query.message)]) ? { message: message([references?.message, ...queries.map(query => query.message)]) } : {}),
    ...(webEnabled ? { web: { status: webStates.some(value => value.status === 'degraded') ? 'degraded' as const : excerpts.some(excerpt => excerpt.source === 'web') ? 'ready' as const : 'empty' as const,
      ...(message(webStates.map(value => value.message)) ? { message: message(webStates.map(value => value.message)) } : {}) } } : {}) }
}
