import { useEffect, useMemo, useState } from 'react'
import { formatDate, getRemainingMs, getTickets, saveTickets, PRIORITY_MINUTES } from '../utils/tickets'

function TicketList({ refreshKey }) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('todos')
  const [priorityFilter, setPriorityFilter] = useState('todos')
  const [tickets, setTickets] = useState(() => getTickets())
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    setTickets(getTickets())
  }, [refreshKey])

  // Actualizar el temporizador cada segundo
  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(Date.now())
      updateTicketPriorities()
      // Forzar re-render actualizando tickets para que el countdown se recalcule
      setTickets([...getTickets()])
    }, 1000)

    return () => window.clearInterval(interval)
  }, [])

  function updateTicketPriorities() {
    const storedTickets = getTickets()
    let modified = false

    storedTickets.forEach((ticket) => {
      // No actualizar prioridad de tickets concluídos o sin dueAt
      if (ticket.status === 'Concluído' || !ticket.dueAt) {
        return
      }

      const remainingMs = new Date(ticket.dueAt).getTime() - Date.now()
      const originalPriority = ticket.priority

      // Cambiar prioridad basado en tiempo restante
      if (remainingMs <= 0) {
        ticket.priority = 'critica'
      } else if (ticket.priority === 'media' && remainingMs <= 30 * 60 * 1000) {
        // Si era media y quedan 30min o menos, cambiar a crítica
        ticket.priority = 'critica'
      } else if (ticket.priority === 'media' && remainingMs <= 60 * 60 * 1000) {
        // Si era media y quedan 1h o menos, cambiar a alta
        ticket.priority = 'alta'
      } else if (ticket.priority === 'alta' && remainingMs <= 30 * 60 * 1000) {
        // Si era alta y quedan 30min o menos, cambiar a crítica
        ticket.priority = 'critica'
      }

      if (originalPriority !== ticket.priority) {
        modified = true
      }
    })

    if (modified) {
      saveTickets(storedTickets)
      setTickets([...storedTickets])
    } else {
      setTickets([...storedTickets])
    }
  }

  function formatDuration(createdAt, concludedAt, attendedAt) {
    if (!createdAt || !concludedAt) return '--'
    
    try {
      // Usar attendedAt si existe, si no usar createdAt
      const startTime = attendedAt ? new Date(attendedAt).getTime() : new Date(createdAt).getTime()
      const endTime = new Date(concludedAt).getTime()
      const durationMs = endTime - startTime
      
      if (durationMs < 0 || isNaN(durationMs)) return '--'
      
      const hours = Math.floor(durationMs / 3600000)
      const minutes = Math.floor((durationMs % 3600000) / 60000)
      const seconds = Math.floor((durationMs % 60000) / 1000)
      
      if (hours > 0) {
        return `${hours}h ${minutes}m`
      }
      if (minutes > 0) {
        return `${minutes}m ${seconds}s`
      }
      return `${seconds}s`
    } catch (e) {
      return '--'
    }
  }

  function sortTickets(ticketsToSort) {
    const priorityOrder = { critica: 1, alta: 2, media: 3, baixa: 4 }
    const statusOrder = { 'Aberto': 1, 'Em andamento': 2, 'Concluído': 3 }
    
    return [...ticketsToSort].sort((a, b) => {
      // Primero por prioridad
      const priorityDiff = (priorityOrder[a.priority] || 5) - (priorityOrder[b.priority] || 5)
      if (priorityDiff !== 0) return priorityDiff
      
      // Luego por estado
      const statusDiff = (statusOrder[a.status] || 4) - (statusOrder[b.status] || 4)
      if (statusDiff !== 0) return statusDiff
      
      // Finalmente por fecha de creación (más antiguos primero)
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    })
  }

  function formatCountdown(ms) {
    if (ms == null) return '--'
    const isPast = ms < 0
    const absMs = Math.max(0, Math.abs(ms))
    const hours = Math.floor(absMs / 3600000)
    const minutes = Math.floor((absMs % 3600000) / 60000)
    const seconds = Math.floor((absMs % 60000) / 1000)

    if (isPast) {
      return 'Vencido!'
    }

    // Mostrar contador para todos los tickets, no solo críticos
    if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds}s`
    }
    return `${seconds}s`
  }

  function updateTicketStatus(ticketId, newStatus) {
    const storedTickets = getTickets()
    const ticket = storedTickets.find((t) => t.id === ticketId)
    
    if (ticket) {
      ticket.status = newStatus
      // Guardar cuándo se atendió el ticket
      if (newStatus === 'Em andamento' && !ticket.attendedAt) {
        ticket.attendedAt = new Date().toISOString()
      }
      // Guardar cuándo se concluyó el ticket
      if (newStatus === 'Concluído') {
        ticket.concludedAt = new Date().toISOString()
      }
      saveTickets(storedTickets)
      setTickets([...storedTickets])
    }
  }

  function getPriorityIcon(priority) {
    switch (priority) {
      case 'critica':
        return '🔴'
      case 'alta':
        return '🟠'
      case 'media':
        return '🟡'
      case 'baixa':
        return '🟢'
      default:
        return '⚪'
    }
  }

  function getPriorityLabel(priority) {
    const labels = {
      critica: 'Crítica',
      alta: 'Alta',
      media: 'Média',
      baixa: 'Baixa',
    }
    return labels[priority] || priority
  }

  const filteredTickets = useMemo(() => {
    const query = search.trim().toLowerCase()
    const filtered = tickets.filter((ticket) => {
      const text = `${ticket.title} ${ticket.area} ${ticket.requester} ${ticket.description}`.toLowerCase()
      const matchesSearch = !query || text.includes(query)
      const matchesStatus = statusFilter === 'todos' || ticket.status === statusFilter
      const matchesPriority = priorityFilter === 'todos' || ticket.priority === priorityFilter
      return matchesSearch && matchesStatus && matchesPriority
    })
    // Ordenar tickets después de filtrar
    return sortTickets(filtered)
  }, [priorityFilter, search, statusFilter, tickets])

  return (
    <section className="tickets-section">
      <div className="tickets-filters">
        <input
          id="search"
          className="filter-input"
          placeholder="🔍 Buscar por título, área ou solicitante"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select
          id="statusFilter"
          className="filter-select"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
        >
          <option value="todos">Todos os status</option>
          <option value="Aberto">Aberto</option>
          <option value="Em andamento">Em andamento</option>
          <option value="Concluído">Concluído</option>
        </select>
        <select
          id="priorityFilter"
          className="filter-select"
          value={priorityFilter}
          onChange={(event) => setPriorityFilter(event.target.value)}
        >
          <option value="todos">Todas as prioridades</option>
          <option value="critica">🔴 Crítica</option>
          <option value="alta">🟠 Alta</option>
          <option value="media">🟡 Média</option>
          <option value="baixa">🟢 Baixa</option>
        </select>
      </div>

      <div className="tickets-grid">
        {!filteredTickets.length ? (
          <div className="empty-state">
            <p>📭 Nenhum chamado encontrado.</p>
          </div>
        ) : (
          filteredTickets.map((ticket) => {
            const remainingMs = getRemainingMs(ticket)
            const countdownLabel = formatCountdown(remainingMs)
            const isVencido = remainingMs != null && remainingMs <= 0
            const isWarning = remainingMs != null && remainingMs <= 60 * 60 * 1000 && remainingMs > 0
            const isDanger = remainingMs != null && remainingMs <= 30 * 60 * 1000

            return (
              <article
                key={ticket.id}
                className={`ticket-card ${ticket.priority} ${isVencido ? 'vencido' : ''} ${isDanger ? 'danger' : isWarning ? 'warning' : ''}`}
              >
                <div className="ticket-header">
                  <div className="ticket-priority">
                    <span className="priority-icon">{getPriorityIcon(ticket.priority)}</span>
                    <span className="priority-label">{getPriorityLabel(ticket.priority)}</span>
                  </div>
                  <div className="ticket-status">
                    <span className={`status-badge status-${ticket.status.toLowerCase().replace(/\s+/g, '-')}`}>
                      {ticket.status}
                    </span>
                  </div>
                </div>

                <div className="ticket-content">
                  <h3 className="ticket-title">{ticket.title || 'Sem título'}</h3>
                  <p className="ticket-description">{ticket.description || ''}</p>
                </div>

                <div className="ticket-footer">
                  <div className="ticket-countdown">
                    {ticket.status === 'Concluído' ? (
                      <>
                        <span className="countdown-icon">✓</span>
                        <span className="countdown-text completed">
                          Durou {formatDuration(ticket.createdAt, ticket.concludedAt, ticket.attendedAt)}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="countdown-icon">⏱️</span>
                        <span className={`countdown-text ${isVencido ? 'vencido' : isDanger ? 'danger' : ''}`}>
                          {countdownLabel}
                        </span>
                      </>
                    )}
                  </div>

                  <div className="ticket-meta">
                    <span className="meta-item">{ticket.area || '--'}</span>
                    <span className="meta-item">{ticket.requester || '--'}</span>
                    <span className="meta-item meta-date">{formatDate(ticket.createdAt)}</span>
                  </div>

                  <div className="ticket-actions">
                    {ticket.status === 'Aberto' && (
                      <button
                        type="button"
                        className="action-btn attend-btn"
                        onClick={() => updateTicketStatus(ticket.id, 'Em andamento')}
                        title="Marcar como em andamento"
                      >
                        👤 Atender
                      </button>
                    )}
                    {ticket.status === 'Em andamento' && (
                      <button
                        type="button"
                        className="action-btn complete-btn"
                        onClick={() => updateTicketStatus(ticket.id, 'Concluído')}
                        title="Marcar como concluído"
                      >
                        ✓ Concluir
                      </button>
                    )}
                    {ticket.status === 'Concluído' && (
                      <span className="action-completed">✓ Concluído</span>
                    )}
                  </div>
                </div>
              </article>
            )
          })
        )}
      </div>
    </section>
  )
}

export default TicketList
