const provider = String(process.env.SMS_PROVIDER || 'twilio').trim().toLowerCase()
const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID || ''
const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN || ''
const twilioFromNumber = process.env.TWILIO_FROM_NUMBER || ''
const twilioMessagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID || ''
const defaultCountryCode = String(process.env.SMS_DEFAULT_COUNTRY_CODE || '55').replace(/\D/g, '')

const smsConfigured = provider === 'twilio'
  && Boolean(twilioAccountSid && twilioAuthToken && (twilioFromNumber || twilioMessagingServiceSid))

function normalizeMessagingServiceSid(value = '') {
  return String(value || '').trim()
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
  const fromPhoneE164 = toE164(twilioFromNumber)
  const messagingServiceSid = normalizeMessagingServiceSid(twilioMessagingServiceSid)

  if (!toPhoneE164) {
    throw new Error('Telefone de destino inválido para envio de SMS.')
  }

  if (!smsConfigured) {
    console.log(`[SMS-FALLBACK] Codigo para ${toPhoneE164}: ${code}`)
    return { mode: 'fallback' }
  }

  const shouldUseMessagingService = Boolean(messagingServiceSid)

  if (!shouldUseMessagingService && !fromPhoneE164) {
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
    payload.set('From', fromPhoneE164)
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
    throw new Error(`Nao foi possivel enviar SMS de confirmacao. ${details}`.trim())
  }

  return {
    mode: 'sms',
    to: toPhoneE164,
    channel: shouldUseMessagingService ? 'messaging-service' : 'from-number',
  }
}
