export const PRIORITY_OPTIONS = [
  { value: 'media', label: 'Média - 3h' },
  { value: 'critica', label: 'Crítica - 20min' },
  { value: 'alta', label: 'Alta - 1h' },
  { value: 'baixa', label: 'Baixa - 1 dia' },
]

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
  if (!ticket?.dueAt || ticket?.status === 'Concluído') return null
  return new Date(ticket.dueAt).getTime() - Date.now()
}
