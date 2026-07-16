const provider = String(process.env.SMS_PROVIDER || 'twilio').trim().toLowerCase()
const twilioAccountSid = String(process.env.TWILIO_ACCOUNT_SID || '').trim()
const twilioAuthToken = String(process.env.TWILIO_AUTH_TOKEN || '').trim()
const twilioFromNumber = String(process.env.TWILIO_FROM_NUMBER || '').trim()
const twilioMessagingServiceSid = String(process.env.TWILIO_MESSAGING_SERVICE_SID || '').trim()
const defaultCountryCode = String(process.env.SMS_DEFAULT_COUNTRY_CODE || '55').replace(/\D/g, '')

const smsConfigured = provider === 'twilio'
  && Boolean(twilioAccountSid && twilioAuthToken && (twilioFromNumber || twilioMessagingServiceSid))

function normalizeMessagingServiceSid(value = '') {
  return String(value || '').trim()
}

function normalizeFromSender(value = '') {
  const sender = String(value || '').trim()
  if (!sender) return ''

  if (/^whatsapp:/i.test(sender)) {
    const rawPhone = sender.split(':').slice(1).join(':')
    const normalizedPhone = toE164(rawPhone)
    return normalizedPhone ? `whatsapp:${normalizedPhone}` : ''
  }

  if (/^MG[0-9a-fA-F]{32}$/.test(sender)) {
    return sender
  }

  const numericPhone = toE164(sender)
  if (numericPhone) {
    return numericPhone
  }

  // Alphanumeric sender IDs are valid in some countries; let Twilio validate this.
  return sender
}

function extractTwilioError(raw = '') {
  const content = String(raw || '').trim()
  if (!content) return ''

  try {
    const parsed = JSON.parse(content)
    const msg = String(parsed?.message || '').trim()
    const code = parsed?.code ? ` (code ${parsed.code})` : ''
    return msg ? `${msg}${code}` : content
  } catch {
    const compact = content.replace(/\s+/g, ' ').trim()
    return compact.length > 320 ? `${compact.slice(0, 320)}...` : compact
  }
}

function toE164(phone = '') {
  const trimmed = String(phone || '').trim()
  if (!trimmed) return ''

  if (trimmed.startsWith('+')) {
    const plusDigits = `+${trimmed.slice(1).replace(/\D/g, '')}`
    return plusDigits.length > 1 ? plusDigits : ''
  }

  const digits = trimmed.replace(/\D/g, '')
  if (!digits) return ''

  const hasCountryCode = defaultCountryCode && digits.startsWith(defaultCountryCode)
  return `+${hasCountryCode ? digits : `${defaultCountryCode}${digits}`}`
}

function getMissingConfig() {
  const missing = []
  if (!twilioAccountSid) missing.push('TWILIO_ACCOUNT_SID')
  if (!twilioAuthToken) missing.push('TWILIO_AUTH_TOKEN')
  if (!twilioFromNumber && !twilioMessagingServiceSid) {
    missing.push('TWILIO_FROM_NUMBER ou TWILIO_MESSAGING_SERVICE_SID')
  }
  return missing
}

export function isSmsConfigured() {
  return smsConfigured
}

export function getSmsConfigurationStatus() {
  return {
    provider,
    configured: smsConfigured,
    missing: getMissingConfig(),
  }
}

export async function sendPhoneChangeCode({ toPhone, userName, code, expiresInMinutes }) {
  if (!toPhone || !code) {
    throw new Error('Dados insuficientes para enviar SMS de confirmação.')
  }

  const toPhoneE164 = toE164(toPhone)
  const normalizedFromSender = normalizeFromSender(twilioFromNumber)
  const sidFromField = /^MG[0-9a-fA-F]{32}$/.test(normalizedFromSender) ? normalizedFromSender : ''
  const messagingServiceSid = normalizeMessagingServiceSid(twilioMessagingServiceSid) || sidFromField

  if (!toPhoneE164) {
    throw new Error('Telefone de destino inválido para envio de SMS.')
  }

  if (!smsConfigured) {
    console.log(`[SMS-FALLBACK] Codigo para ${toPhoneE164}: ${code}`)
    return { mode: 'fallback' }
  }

  const shouldUseMessagingService = Boolean(messagingServiceSid)

  if (!shouldUseMessagingService && !normalizedFromSender) {
    throw new Error('Telefone de origem inválido em TWILIO_FROM_NUMBER.')
  }

  const message = [
    `Ola, ${userName || 'usuario'}!`,
    `Codigo de seguranca: ${code}.`,
    `Expira em ${expiresInMinutes} min.`,
  ].join(' ')

  const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`
  const payload = new URLSearchParams({
    To: toPhoneE164,
    Body: message,
  })

  if (shouldUseMessagingService) {
    payload.set('MessagingServiceSid', messagingServiceSid)
  } else {
    payload.set('From', normalizedFromSender)
  }

  const auth = Buffer.from(`${twilioAccountSid}:${twilioAuthToken}`).toString('base64')

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: payload,
  })

  if (!response.ok) {
    const details = await response.text().catch(() => '')
    const twilioReason = extractTwilioError(details)
    throw new Error(
      `Nao foi possivel enviar SMS de confirmacao.${twilioReason ? ` ${twilioReason}` : ''}`.trim(),
    )
  }

  return {
    mode: 'sms',
    to: toPhoneE164,
    channel: shouldUseMessagingService ? 'messaging-service' : 'from-number',
  }
}
