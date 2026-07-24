export const PRIORITY_OPTIONS = [
  { value: 'media', label: 'Média - 3h' },
  { value: 'critica', label: 'Crítica - 20min' },
  { value: 'alta', label: 'Alta - 1h' },
  { value: 'baixa', label: 'Baixa - 1 dia' },
]

const PRIORITY_SLA_MINUTES = {
  critica: 20,
  alta: 60,
  media: 180,
  baixa: 1440,
}

export function formatDate(dateString) {
  if (!dateString) return ''
  const date = new Date(dateString)
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

export function formatRemaining(ms) {
  if (ms == null) return '--'
  const isPast = ms < 0
  const absMs = Math.max(0, Math.abs(ms))
  const hours = Math.floor(absMs / 3600000)
  const minutes = Math.floor((absMs % 3600000) / 60000)
  const parts = []
  if (hours) parts.push(`${hours}h`)
  parts.push(`${minutes}m`)
  return isPast ? `Vencido ${parts.join(' ')}` : `${parts.join(' ')} restantes`
}

export function getRemainingMs(ticket) {
  if (ticket?.status === 'Concluído') return null

  const dueAt = ticket?.dueAt ? new Date(ticket.dueAt).getTime() : NaN
  if (Number.isFinite(dueAt)) {
    return dueAt - Date.now()
  }

  const openedAt = ticket?.dataAbertura ? new Date(ticket.dataAbertura).getTime() : NaN
  const priority = String(ticket?.prioridade || '').toLowerCase()
  const slaMinutes = PRIORITY_SLA_MINUTES[priority]

  if (!Number.isFinite(openedAt) || !Number.isFinite(slaMinutes)) {
    return null
  }

  return openedAt + slaMinutes * 60000 - Date.now()
}

export function getDynamicPriorityKey(ticket, remainingMs = getRemainingMs(ticket)) {
  const initial = String(ticket?.prioridade || '').toLowerCase()
  if (remainingMs == null) return initial || 'baixa'
  if (remainingMs <= 0) return 'vencido'

  if (initial === 'baixa') {
    if (remainingMs <= 20 * 60 * 1000) return 'critica'
    if (remainingMs <= 60 * 60 * 1000) return 'alta'
    if (remainingMs <= 3 * 60 * 60 * 1000) return 'media'
    return 'baixa'
  }

  if (initial === 'media') {
    if (remainingMs <= 20 * 60 * 1000) return 'critica'
    if (remainingMs <= 60 * 60 * 1000) return 'alta'
    return 'media'
  }

  if (initial === 'alta') {
    if (remainingMs <= 20 * 60 * 1000) return 'critica'
    return 'alta'
  }

  return 'critica'
}
