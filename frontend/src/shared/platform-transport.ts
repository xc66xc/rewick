export const productionPlatformUrl = 'https://api.junshi.icu'

// Enforce at build and network boundaries; reading old settings must still allow
// startup to replace the platform URL and clear credentials for the old origin.
export function assertPlatformTransport(value: string): void {
  const url = new URL(value)
  const loopback = url.hostname === 'localhost' || url.hostname === '[::1]' || /^127(?:\.\d{1,3}){3}$/.test(url.hostname)
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
    throw new Error('平台连接必须使用 HTTPS；仅本机开发地址允许 HTTP。')
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('平台地址不能包含账号、密码、查询参数或片段。')
  }
}
