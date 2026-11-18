import { Resend } from 'resend'

const resendApiKey = process.env.RESEND_API_KEY || ''
const resendWebhookSecret = process.env.RESEND_WEBHOOK_SECRET || ''
const resendInboundDomain = String(process.env.RESEND_INBOUND_DOMAIN || '').trim().toLowerCase()

export function isResendConfigured() {
  return Boolean(resendApiKey)
}

export function getResendInboundStatus() {
  return {
    configured: Boolean(resendApiKey && resendWebhookSecret && resendInboundDomain),
  }
}

export function getResendInboundDomain() {
  return resendInboundDomain
}

export function getInboundReplyAddress(ticketId) {
  if (!resendInboundDomain) return ''
  const safeTicketId = String(ticketId || '').replace(/[^a-z0-9_-]/gi, '')
  if (!safeTicketId) return ''
  return `ticket-${safeTicketId}@${resendInboundDomain}`
}

export function verifyResendWebhook(payload, headers) {
  if (!resendWebhookSecret) {
    throw new Error('RESEND_WEBHOOK_SECRET nao configurada.')
  }

  return createResendClient().webhooks.verify({
    payload,
    headers,
    webhookSecret: resendWebhookSecret,
  })
}

export async function getReceivedEmail(emailId) {
  const { data, error } = await createResendClient().emails.receiving.get(emailId)
  if (error) {
    throw normalizeResendError(error, 'Nao foi possivel recuperar o e-mail recebido no Resend.')
  }
  if (!data) {
    throw new Error('O Resend nao retornou o conteudo do e-mail recebido.')
  }
  return data
}

function createResendClient() {
  if (!resendApiKey) {
    throw new Error('RESEND_API_KEY nao configurada.')
  }

  return new Resend(resendApiKey)
}

function normalizeResendError(error, fallbackMessage) {
  const message = error?.message || error?.error?.message || ''
  return new Error(message ? `${fallbackMessage} ${message}`.trim() : fallbackMessage)
}

export async function createResendDomain(name) {
  try {
    const client = createResendClient()
    return await client.domains.create({ name })
  } catch (error) {
    throw normalizeResendError(error, 'Nao foi possivel criar o dominio no Resend.')
  }
}

export async function getResendDomain(id) {
  try {
    const client = createResendClient()
    return await client.domains.get(id)
  } catch (error) {
    throw normalizeResendError(error, 'Nao foi possivel recuperar o dominio no Resend.')
  }
}

export async function verifyResendDomain(id) {
  try {
    const client = createResendClient()
    return await client.domains.verify(id)
  } catch (error) {
    throw normalizeResendError(error, 'Nao foi possivel verificar o dominio no Resend.')
  }
}

export async function updateResendDomain(payload) {
  try {
    const client = createResendClient()
    return await client.domains.update(payload)
  } catch (error) {
    throw normalizeResendError(error, 'Nao foi possivel atualizar o dominio no Resend.')
  }
}

export async function listResendDomains() {
  try {
    const client = createResendClient()
    return await client.domains.list()
  } catch (error) {
    throw normalizeResendError(error, 'Nao foi possivel listar os dominios no Resend.')
  }
}

export async function removeResendDomain(id) {
  try {
    const client = createResendClient()
    return await client.domains.remove(id)
  } catch (error) {
    throw normalizeResendError(error, 'Nao foi possivel remover o dominio no Resend.')
  }
}