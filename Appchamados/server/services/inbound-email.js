const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function parseTicketReplyRecipient(value, domain) {
  const normalizedDomain = String(domain || '').trim().toLowerCase()
  const recipient = String(value || '').trim().toLowerCase()
  const suffix = `@${normalizedDomain}`

  if (!normalizedDomain || !recipient.endsWith(suffix)) {
    return null
  }

  const localPart = recipient.slice(0, -suffix.length)
  const match = /^ticket-(\d+)-([a-f0-9]{32})$/.exec(localPart)
  return match ? { ticketId: match[1], replyKey: match[2] } : null
}

export function getEmailAddress(value) {
  const raw = String(value || '').trim()
  const bracketedAddress = /<([^<>]+)>/.exec(raw)?.[1]
  const address = String(bracketedAddress || raw).trim().toLowerCase()
  return EMAIL_PATTERN.test(address) ? address : ''
}

export function getInboundMessageText(email, maxLength) {
  let text = String(email?.text || '')
  if (!text.trim() && email?.html) {
    text = String(email.html)
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|tr)>/gi, '\n')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'")
  }

  return text.replace(/\r\n?/g, '\n').trim().slice(0, maxLength)
}
