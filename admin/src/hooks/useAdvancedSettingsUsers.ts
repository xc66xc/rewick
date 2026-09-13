import { useEffect, useState } from 'react'
import { z } from 'zod'
import { type ApiClient, message } from '../api'
import { authorizedUsersSchema } from '../desktop-settings'
import { pageSchema, userSchema } from '../types'
import { useResource } from './useResource'

const searchSchema = pageSchema(userSchema.extend({ email: z.string().nullable() }))
type SearchUser = z.infer<typeof searchSchema>['items'][number]
export function useAdvancedSettingsUsers(api: ApiClient) {
  const { state, reload } = useResource(api, '/admin/desktop-settings/users', authorizedUsersSchema)
  const [search, setSearch] = useState({ query: '', revision: 0 })
  const [results, setResults] = useState<SearchUser[] | null>(null)
  const [total, setTotal] = useState(0)
  const [searching, setSearching] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  useEffect(() => {
    if (!search.query) return
    const controller = new AbortController()
    setSearching(true); setError(''); setResults(null)
    void api.request(`/admin/users?${new URLSearchParams({ query: search.query, page: '1', size: '20' })}`, searchSchema, { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) { setResults(data.items); setTotal(data.total) } })
      .catch(reason => { if (!controller.signal.aborted) setError(message(reason)) })
      .finally(() => { if (!controller.signal.aborted) setSearching(false) })
    return () => controller.abort()
  }, [api, search])
  async function change(id: string, enabled: boolean) {
    if (busy) return
    setBusy(true); setError(''); setNotice('')
    try {
      await api.request(`/admin/desktop-settings/users/${encodeURIComponent(id)}`, z.undefined(), { method: 'PUT', body: { enabled } })
      setNotice(enabled ? '已添加高级设置权限。' : '已移除高级设置权限。'); reload()
    } catch (reason) { setError(message(reason)) }
    finally { setBusy(false) }
  }
  return { state, reload, results, total, searching, busy, error, notice, change, search: (query: string) => setSearch(current => ({ query: query.trim(), revision: current.revision + 1 })) }
}
