const acknowledgement = /^(?:嗯哼|嗯|唔|哦|噢|啊|呃|诶|欸|好的|好吧|好|对的|对|是的|是|行了|行|没错|明白了|明白|懂了|知道了|了解了|了解|收到|可以|不错|ok(?:ay)?|yes|yeah|yep|right|sure|uhhuh|mmhmm|mhm)+$/

/** Match the entire utterance; a short question or a request to continue is still actionable. */
export function isPureAcknowledgement(text: string): boolean {
  const normalized = text.normalize('NFKC').toLowerCase()
  if (normalized.includes('?')) return false
  const words = normalized.replace(/[\s\p{P}]/gu, '')
  return !words || acknowledgement.test(words)
}
