import { getMediaUrl } from '../services/api'

export const ROLE_OPTIONS = ['Manutenção', 'TI']
export const TICKETS_CACHE_TTL_MS = 15000

const ticketsQueryCache = new Map()

export function buildTicketsCacheKey(filters = {}) {
  const normalizedEntries = Object.entries(filters)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .sort(([left], [right]) => left.localeCompare(right))

  return JSON.stringify(normalizedEntries)
}

export function readTicketsCache(filters = {}, maxAgeMs = TICKETS_CACHE_TTL_MS) {
  const cacheKey = buildTicketsCacheKey(filters)
  const cached = ticketsQueryCache.get(cacheKey)

  if (!cached) {
    return null
  }

  if (Date.now() - cached.timestamp > maxAgeMs) {
    ticketsQueryCache.delete(cacheKey)
    return null
  }

  return cached.data
}

export function writeTicketsCache(filters = {}, result = {}) {
  const cacheKey = buildTicketsCacheKey(filters)
  const tickets = Array.isArray(result?.tickets) ? result.tickets : []

  ticketsQueryCache.set(cacheKey, {
    timestamp: Date.now(),
    data: {
      tickets,
    },
  })
}

export function getFullName(user) {
  const firstName = String(user?.nome || '').trim()
  const lastName = String(user?.sobrenome || '').trim()

  if (firstName && lastName) {
    if (firstName.toLowerCase().endsWith(` ${lastName.toLowerCase()}`) || firstName.toLowerCase() === lastName.toLowerCase()) {
      return firstName
    }

    return `${firstName} ${lastName}`
  }

  return firstName || 'Usuário'
}

export function splitFullName(user) {
  const rawFirstName = String(user?.nome || '').trim()
  const rawSurname = String(user?.sobrenome || '').trim()

  if (rawSurname) {
    const parts = rawFirstName.split(/\s+/).filter(Boolean)
    return {
      nome: parts[0] || rawFirstName || '',
      sobrenome: rawSurname,
    }
  }

  const parts = rawFirstName.split(/\s+/).filter(Boolean)
  if (parts.length <= 1) {
    return {
      nome: rawFirstName,
      sobrenome: '',
    }
  }

  return {
    nome: parts[0] || '',
    sobrenome: parts.slice(1).join(' '),
  }
}

export function formatPriority(priority = '') {
  const labels = {
    critica: 'Crítica',
    alta: 'Alta',
    media: 'Média',
    baixa: 'Baixa',
  }

  return labels[String(priority).toLowerCase()] || 'Não definida'
}

export function getProfilePhotoSrc(user) {
  if (!user?.foto_perfil) return ''
  return getMediaUrl(user.foto_perfil)
}

export function formatPhoneDisplay(value = '') {
  const digits = String(value || '').replace(/\D/g, '')

  if (!digits) return '--'
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  }

  return digits
}

export function formatPhoneInput(value = '') {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 11)

  if (!digits) return ''
  if (digits.length <= 2) return `(${digits}`
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
}

export function normalizeEmailInput(value = '') {
  return String(value || '').trim().toLowerCase()
}