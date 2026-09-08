import { useEffect, useRef, useState } from 'react'

interface DraftRecord { id?: string }
interface CachedDraft { draft: DraftRecord; baseline: string }
const draftCache = new Map<string, CachedDraft>()
export default function useLibraryDraft<T extends DraftRecord>(records: T[], empty: T, ready: boolean, preferredId: string | null | undefined, cacheKey: string) {
  // Each editor owns a distinct key, so its cached record keeps the same draft type.
  const cached = useRef(draftCache.get(cacheKey) as { draft: T; baseline: string } | undefined)
  const [draft, setDraft] = useState<T>(cached.current?.draft ?? empty)
  const [baseline, setBaseline] = useState(cached.current?.baseline ?? JSON.stringify(empty))
  const [restored, setRestored] = useState(Boolean(cached.current))
  const [pending, setPending] = useState<(() => void) | null>(null)
  const initialized = useRef(Boolean(cached.current))
  const dirty = JSON.stringify(draft) !== baseline
  const saved = records.find(record => record.id === draft.id)
  const savedVersion = JSON.stringify(saved)
  const latest = useRef({ records, empty, saved, dirty, preferredId })
  latest.current = { records, empty, saved, dirty, preferredId }
  function replace(next: T) { setDraft(next); setBaseline(JSON.stringify(next)); setPending(null); setRestored(false); draftCache.delete(cacheKey) }
  useEffect(() => {
    if (dirty) draftCache.set(cacheKey, { draft, baseline })
    else draftCache.delete(cacheKey)
  }, [cacheKey, draft, baseline, dirty])
  useEffect(() => {
    if (!ready) return
    const current = latest.current
    if (!initialized.current) {
      initialized.current = true
      replace(current.records.find(record => record.id === current.preferredId) ?? current.records[0] ?? current.empty)
    } else if (!current.dirty && draft.id) replace(current.saved ?? current.empty)
  }, [ready, savedVersion, draft.id])
  function request(action: () => void) { if (dirty) setPending(() => action); else action() }
  function discardAndContinue() { const action = pending; replace(JSON.parse(baseline) as T); action?.() }
  return { draft, setDraft, dirty, restored, replace, request, pending: Boolean(pending), keepDraft: () => setPending(null), discardAndContinue }
}
