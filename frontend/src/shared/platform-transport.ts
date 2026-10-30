export const productionPlatformUrl = 'http://101.33.245.166:8080'

// Enforce at build and network boundaries; reading old settings must still allow
// startup to replace the platform URL and clear credentials for the old origin.
export function assertPlatformTransport(value: string): void {
  const url = new URL(value)
  // URL parsing validates IP literals before they reach this boundary.
  const ipAddress = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(url.hostname) || /^\[.*:.*\]$/.test(url.hostname)
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && (ipAddress || url.hostname === 'localhost'))) {
    throw new Error('平台域名必须使用 HTTPS；显式 IP 地址或 localhost 允许 HTTP。')
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('平台地址不能包含账号、密码、查询参数或片段。')
  }
}
