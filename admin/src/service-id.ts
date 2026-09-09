/** getRandomValues also works on HTTP origins, unlike randomUUID. */
export function createServiceId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return 'service-' + Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}
