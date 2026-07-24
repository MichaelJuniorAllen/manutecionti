import { useEffect, useMemo, useState } from 'react'
import { formatDate, getRemainingMs } from '../utils/tickets'
import Avatar from './common/Avatar'

function TicketList({ tickets = [], onUpdateStatus, currentUserId = '', currentUserName = '' }) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('todos')
  const [priorityFilter, setPriorityFilter] = useState('todos')
  const [departmentFilter, setDepartmentFilter] = useState('todos')
  const [localTickets, setLocalTickets] = useState([])

  useEffect(() => {
    setLocalTickets(tickets)
  }, [tickets])

  useEffect(() => {
    const interval = window.setInterval(() => {
      setLocalTickets((current) => [...current])
    }, 1000)

    return () => window.clearInterval(interval)
  }, [])

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

  function formatElapsed(startAt, endAt = null) {
    if (!startAt) return '--'

    const start = new Date(startAt).getTime()
    const end = endAt ? new Date(endAt).getTime() : Date.now()

    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
      return '--'
    }

    const durationMs = end - start
    const hours = Math.floor(durationMs / 3600000)
    const minutes = Math.floor((durationMs % 3600000) / 60000)
    const seconds = Math.floor((durationMs % 60000) / 1000)

    if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`
    }

    if (minutes > 0) {
      return `${minutes}m ${seconds}s`
    }

    return `${seconds}s`
  }

  function sortTickets(ticketsToSort) {
    const priorityOrder = { critica: 1, alta: 2, media: 3, baixa: 4 }
    const statusOrder = { 'Aberto': 1, 'Em andamento': 2, 'Concluído': 3 }
    
    return [...ticketsToSort].sort((a, b) => {
      // Primero por prioridad
      const priorityDiff = (priorityOrder[a.prioridade] || 5) - (priorityOrder[b.prioridade] || 5)
      if (priorityDiff !== 0) return priorityDiff
      
      // Luego por estado
      const statusDiff = (statusOrder[a.status] || 4) - (statusOrder[b.status] || 4)
      if (statusDiff !== 0) return statusDiff
      
      // Finalmente por fecha de creación (más antiguos primero)
      return new Date(a.dataAbertura).getTime() - new Date(b.dataAbertura).getTime()
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

  function getAttendantAvatar(ticket) {
    if (!ticket?.atendenteFotoPerfil) return null
    return ticket.atendenteFotoPerfil
  }

  function normalize(value = '') {
    return String(value).trim().toLowerCase()
  }

  const filteredTickets = useMemo(() => {
    const query = search.trim().toLowerCase()
    const filtered = localTickets.filter((ticket) => {
      const text = `${ticket.titulo} ${ticket.area} ${ticket.tecnicoResponsavel} ${ticket.descricao} ${ticket.numeroChamado}`.toLowerCase()
      const matchesSearch = !query || text.includes(query)
      const matchesStatus = statusFilter === 'todos' || ticket.status === statusFilter
      const matchesPriority = priorityFilter === 'todos' || ticket.prioridade === priorityFilter
      const matchesDepartment = departmentFilter === 'todos' || ticket.tecnicoResponsavel === departmentFilter
      return matchesSearch && matchesStatus && matchesPriority && matchesDepartment
    })
    return sortTickets(filtered)
  }, [localTickets, priorityFilter, search, statusFilter, departmentFilter])

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
        <select
          id="departmentFilter"
          className="filter-select"
          value={departmentFilter}
          onChange={(event) => setDepartmentFilter(event.target.value)}
        >
          <option value="todos">Todos os departamentos</option>
          <option value="Manutenção">Manutenção</option>
          <option value="TI">TI</option>
          <option value="Engenharia Clínica">Engenharia Clínica</option>
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
            const isVencido = remainingMs != null && remainingMs <= 0 && ticket.status !== 'Concluído'
            const isWarning = remainingMs != null && remainingMs <= 60 * 60 * 1000 && remainingMs > 0
            const isDanger = remainingMs != null && remainingMs <= 30 * 60 * 1000
            const attendantName = ticket.atendenteNome || ticket.tecnicoResponsavel || 'Não atribuído'
            const attendantAvatar = getAttendantAvatar(ticket)
            const responsibleLabel = ticket.tecnicoResponsavel || 'Não atribuído'
            const andamentoAoVivo = ticket.status === 'Em andamento'
              ? formatElapsed(ticket.dataAtendimento)
              : '--'
            const andamentoConcluido = ticket.status === 'Concluído'
              ? formatElapsed(ticket.dataAtendimento, ticket.dataFechamento)
              : '--'
            const hasAttendantId = Boolean(ticket.atendenteId)
            const legacyResponsible = normalize(ticket.tecnicoResponsavel)
            const currentName = normalize(currentUserName)
            const hasSpecificLegacyResponsible = legacyResponsible && legacyResponsible !== normalize('Não atribuído')
            const legacyCanConclude = !hasSpecificLegacyResponsible || legacyResponsible === currentName
            const canConclude = hasAttendantId
              ? String(ticket.atendenteId) === String(currentUserId)
              : legacyCanConclude

            return (
              <article
                key={ticket.id}
                className={`ticket-card ${ticket.prioridade} ${isVencido ? 'vencido' : ''} ${isDanger ? 'danger' : isWarning ? 'warning' : ''}`}
              >
                <div className="ticket-header">
                  <div className="ticket-priority">
                    <span className="priority-icon">{getPriorityIcon(ticket.prioridade)}</span>
                    <span className="priority-label">{getPriorityLabel(ticket.prioridade)}</span>
                  </div>
                  <div className="ticket-status">
                    <span className={`status-badge status-${ticket.status.toLowerCase().replace(/\s+/g, '-')}`}>
                      {ticket.status}
                    </span>
                    <span className="responsible-badge" title={`Responsável definido na abertura: ${responsibleLabel}`}>
                      {responsibleLabel}
                    </span>
                  </div>
                </div>

                {ticket.status === 'Em andamento' && (
                  <>
                    <div className="attendant-chip" title={`Atendendo: ${attendantName}`}>
                      <Avatar name={attendantName} photoUrl={attendantAvatar} size={22} />
                      <span className="attendant-label">Em atendimento por {attendantName}</span>
                    </div>
                    <div className="attendant-chip" title="Tempo em andamento">
                      <span className="attendant-label">Tempo em andamento: {andamentoAoVivo}</span>
                    </div>
                  </>
                )}

                <div className="ticket-content">
                  <h3 className="ticket-title">{ticket.titulo || 'Sem título'}</h3>
                  <p className="ticket-description">{ticket.descricao || ''}</p>
                </div>

                <div className="ticket-footer">
                  <div className="ticket-countdown">
                    {ticket.status === 'Concluído' ? (
                      <>
                        <span className="countdown-icon">✓</span>
                        <span className="countdown-text completed">
                          Total {formatDuration(ticket.dataAbertura, ticket.dataFechamento, ticket.dataAtendimento)} | Andamento {andamentoConcluido}
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
                    <span className="meta-item">#{ticket.numeroChamado || '--'}</span>
                    <span className="meta-item meta-date">{formatDate(ticket.dataAbertura)}</span>
                  </div>

                  <div className="ticket-actions">
                    {ticket.status === 'Aberto' && (
                      <button
                        type="button"
                        className="action-btn attend-btn"
                        onClick={() => onUpdateStatus?.(ticket.id, 'Em andamento')}
                        title="Marcar como em andamento"
                      >
                        👤 Atender
                      </button>
                    )}
                    {ticket.status === 'Em andamento' && (
                      <button
                        type="button"
                        className="action-btn complete-btn"
                        disabled={!canConclude}
                        onClick={() => onUpdateStatus?.(ticket.id, 'Concluído')}
                        title={canConclude ? 'Marcar como concluído' : 'Somente quem está atendendo pode concluir'}
                      >
                        {canConclude ? '✓ Concluir' : '🔒 Somente atendente'}
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
