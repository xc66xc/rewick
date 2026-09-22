export function normalizeEnvironmentHotwords(words: string[]): string[] {
  return [...new Set(words.map(word => word.trim()).filter(Boolean))]
}

export function environmentHotwordsError(words: string[]): string {
  if (words.length > 200) return '专业术语最多 200 个。'
  if (words.some(word => !word.trim() || word.length > 80 || /[\u0000-\u001f\u007f-\u009f]/u.test(word))) {
    return '每个专业术语须为 1—80 个字符，且不能包含控制字符。'
  }
  const vocabulary = Object.fromEntries(words.map(word => [word, 3]))
  if (new TextEncoder().encode(JSON.stringify(vocabulary)).length > 4096) return '专业术语总长度超出限制，请精简后保存。'
  return ''
}
