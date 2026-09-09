const key = 'copilot.admin.session'
export interface SavedSession { accessToken: string; expiresAt: string }
export function clearSession() { sessionStorage.removeItem(key) }
export function saveSession(value: SavedSession) {
  sessionStorage.setItem(key, JSON.stringify({ accessToken: value.accessToken, expiresAt: value.expiresAt }))
}
export function readSession(): SavedSession | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(key) || 'null') as SavedSession | null
    if (value && typeof value.accessToken === 'string' && value.accessToken.length > 0 && value.accessToken.length <= 4096
      && typeof value.expiresAt === 'string' && Date.parse(value.expiresAt) > Date.now()) return value
  } catch { /* Discard malformed or unavailable tab storage. */ }
  clearSession()
  return null
}
