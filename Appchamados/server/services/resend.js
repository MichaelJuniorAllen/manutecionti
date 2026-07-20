import { Resend } from 'resend'

const resendApiKey = process.env.RESEND_API_KEY || ''

export function isResendConfigured() {
  return Boolean(resendApiKey)
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