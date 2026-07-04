export const STORAGE_KEY = 'registroChamados'

export const PRIORITY_MINUTES = {
  critica: 20,
  alta: 60,
  media: 180,
  baixa: 1440,
}

export const PRIORITY_OPTIONS = [
  { value: 'media', label: 'Média - 3h' },
  { value: 'critica', label: 'Crítica - 20min' },
  { value: 'alta', label: 'Alta - 1h' },
  { value: 'baixa', label: 'Baixa - 1 dia' },
]

export function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000)
}

export function getTickets() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
  } catch (error) {
    return []
  }
}

export function saveTickets(tickets) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tickets))
}

export function buildTicket(formValues) {
  const createdAt = new Date()
  const priority = formValues.priority || 'media'
  const durationMinutes = PRIORITY_MINUTES[priority] || 180

  return {
    id: Date.now().toString(),
    title: formValues.title.trim(),
    area: formValues.area.trim(),
    requester: formValues.requester.trim(),
    priority,
    responsible: formValues.responsible.trim(),
    description: formValues.description.trim(),
    status: 'Aberto',
    createdAt: createdAt.toISOString(),
    dueAt: addMinutes(createdAt, durationMinutes).toISOString(),
    durationMinutes,
  }
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
  if (!ticket.dueAt) return null
  return new Date(ticket.dueAt).getTime() - Date.now()
}

export function getDueClass(ticket) {
  const remaining = getRemainingMs(ticket)
  if (ticket.status === 'Concluído' || remaining == null) return ''
  if (remaining <= 0) return 'due-late'
  if (remaining <= 30 * 60 * 1000) return 'due-danger'
  if (remaining <= 60 * 60 * 1000) return 'due-warning'
  return ''
}

export function getPriorityClass(priority) {
  if (priority === 'critica') return 'red'
  if (priority === 'alta') return 'amber'
  if (priority === 'baixa') return 'green'
  return 'blue'
}

export function getPriorityLabel(priority) {
  return PRIORITY_OPTIONS.find((option) => option.value === priority)?.label || priority
}
