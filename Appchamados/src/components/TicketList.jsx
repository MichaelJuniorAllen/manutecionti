import { useEffect, useMemo, useState } from 'react'
import { formatDate, getRemainingMs } from '../utils/tickets'
import Avatar from './common/Avatar'

const PAUSE_REASON_OPTIONS = [
  'Final do expediente',
  'Aguardando peça',
  'Aguardando autorização',
  'Aguardando outro setor',
  'Necessita outro técnico',
  'Outro',
]

function TicketList({ tickets = [], onUpdateStatus, currentUserId = '', currentUserName = '' }) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('todos')
  const [priorityFilter, setPriorityFilter] = useState('todos')
  const [departmentFilter, setDepartmentFilter] = useState('todos')
  const [localTickets, setLocalTickets] = useState([])
  const [pauseTicketId, setPauseTicketId] = useState(null)
  const [pauseReason, setPauseReason] = useState(PAUSE_REASON_OPTIONS[0])
  const [pauseNotes, setPauseNotes] = useState('')
  const [historyTicketId, setHistoryTicketId] = useState(null)
  const [actionLoadingId, setActionLoadingId] = useState('')

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

  function formatWorkedMinutes(minutes) {
    const safeMinutes = Number(minutes)
    if (!Number.isFinite(safeMinutes) || safeMinutes < 0) return '--'
    const hours = Math.floor(safeMinutes / 60)
    const mins = safeMinutes % 60
    if (hours > 0) return `${hours}h ${mins}min`
    return `${mins}min`
  }

  function getSessionActionLabel(session) {
    if (!session) return '--'
    if (session.status === 'Concluído') return 'Concluiu'
    if (session.status === 'Pausado') return 'Pausou'
    if (session.status === 'Em andamento') {
      return session.tipoInicio === 'Retomado' ? 'Retomou' : 'Iniciou'
    }
    return session.status || '--'
  }

  async function handleStatusAction(ticketId, status, extras = {}) {
    try {
      setActionLoadingId(String(ticketId))
      await onUpdateStatus?.(ticketId, status, extras)
    } finally {
      setActionLoadingId('')
    }
  }

  async function handlePauseSubmit(event) {
    event.preventDefault()
    if (!pauseTicketId) return
    if (!pauseNotes.trim()) return

    await handleStatusAction(pauseTicketId, 'Aguardando Continuação', {
      motivoPausa: pauseReason,
      observacaoSessao: pauseNotes.trim(),
    })

    setPauseTicketId(null)
    setPauseReason(PAUSE_REASON_OPTIONS[0])
    setPauseNotes('')
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
          <option value="Aguardando Continuação">Aguardando Continuação</option>
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
            const ticketSessions = ticket?.sessoes || []
            const lastSession = ticketSessions.length ? ticketSessions[ticketSessions.length - 1] : null
            const lastClosedSession = [...ticketSessions].reverse().find((session) => session?.fim) || null
            const andamentoAoVivo = ticket.status === 'Em andamento'
              ? formatElapsed(ticket.dataAtendimento)
              : '--'
            const andamentoConcluido = ticket.status === 'Concluído'
              ? formatElapsed(ticket.dataAtendimento, ticket.dataFechamento)
              : '--'
            const hasAttendantId = Boolean(ticket.atendenteId)
            const canConclude = hasAttendantId && String(ticket.atendenteId) === String(currentUserId)
            const canPause = canConclude && ticket.status === 'Em andamento'
            const isActionLoading = actionLoadingId === String(ticket.id)

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

                {ticket.status === 'Aguardando Continuação' && lastClosedSession ? (
                  <div className="last-session-summary">
                    <strong>Último atendimento</strong>
                    <p>👤 {lastClosedSession.tecnicoNome || 'Técnico não informado'}</p>
                    <p>Tempo trabalhado: {formatWorkedMinutes(lastClosedSession.tempoTrabalhado)}</p>
                    <p>Motivo: {lastClosedSession.motivoPausa || '--'}</p>
                    <p>Observação: {lastClosedSession.observacao || '--'}</p>
                  </div>
                ) : null}

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
                    <span className="meta-item">{ticket.solicitante || 'Solicitante não informado'}</span>
                    <span className="meta-item meta-date">{formatDate(ticket.dataAbertura)}</span>
                  </div>

                  <div className="ticket-actions">
                    {ticket.status === 'Aberto' && (
                      <button
                        type="button"
                        className="action-btn attend-btn"
                        disabled={isActionLoading}
                        onClick={() => handleStatusAction(ticket.id, 'Em andamento')}
                        title="Marcar como em andamento"
                      >
                        {isActionLoading ? '...' : '👤 Atender'}
                      </button>
                    )}
                    {ticket.status === 'Aguardando Continuação' && (
                      <button
                        type="button"
                        className="action-btn attend-btn"
                        disabled={isActionLoading}
                        onClick={() => handleStatusAction(ticket.id, 'Em andamento')}
                        title="Retomar atendimento"
                      >
                        {isActionLoading ? '...' : '↺ Continuar Atendimento'}
                      </button>
                    )}
                    {ticket.status === 'Em andamento' && (
                      <>
                        <button
                          type="button"
                          className="action-btn complete-btn"
                          disabled={!canConclude || isActionLoading}
                          onClick={() => handleStatusAction(ticket.id, 'Concluído')}
                          title={canConclude ? 'Finalizar atendimento' : 'Somente quem está atendendo pode concluir'}
                        >
                          {canConclude ? (isActionLoading ? '...' : '✓ Finalizar Atendimento') : '🔒 Somente atendente'}
                        </button>
                        <button
                          type="button"
                          className="action-btn pause-btn"
                          disabled={!canPause || isActionLoading}
                          onClick={() => {
                            setPauseTicketId(ticket.id)
                            setPauseReason(PAUSE_REASON_OPTIONS[0])
                            setPauseNotes('')
                          }}
                          title={canPause ? 'Pausar atendimento' : 'Somente quem está atendendo pode pausar'}
                        >
                          ⏸ Pausar Atendimento
                        </button>
                      </>
                    )}
                    {ticket.status === 'Concluído' && (
                      <span className="action-completed">✓ Concluído</span>
                    )}
                    <button
                      type="button"
                      className="action-btn history-btn"
                      onClick={() => setHistoryTicketId(ticket.id)}
                      title="Ver histórico completo"
                    >
                      🕘 Ver Histórico
                    </button>
                  </div>
                </div>
              </article>
            )
          })
        )}
      </div>

      {pauseTicketId ? (
        <div className="ticket-modal-overlay" role="dialog" aria-modal="true">
          <div className="ticket-modal">
            <h3>Pausar atendimento</h3>
            <p>Registre o motivo e a observação da pausa para manter o histórico completo.</p>
            <form onSubmit={handlePauseSubmit} className="ticket-modal-form">
              <div className="field">
                <label htmlFor="pause-reason">Motivo</label>
                <select
                  id="pause-reason"
                  value={pauseReason}
                  onChange={(event) => setPauseReason(event.target.value)}
                  className="form-input"
                >
                  {PAUSE_REASON_OPTIONS.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="pause-notes">Observações *</label>
                <textarea
                  id="pause-notes"
                  required
                  value={pauseNotes}
                  onChange={(event) => setPauseNotes(event.target.value)}
                  className="form-textarea"
                  placeholder="Descreva o que foi feito e o que falta concluir."
                />
              </div>
              <div className="ticket-modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setPauseTicketId(null)}>
                  Cancelar
                </button>
                <button type="submit" className="btn-primary" disabled={!pauseNotes.trim()}>
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {historyTicketId ? (
        <div className="ticket-modal-overlay" role="dialog" aria-modal="true">
          <div className="ticket-modal ticket-history-modal">
            <h3>Histórico de Atendimento</h3>
            <div className="ticket-history-timeline">
              {(() => {
                const selectedTicket = localTickets.find((item) => String(item.id) === String(historyTicketId))
                const sessions = selectedTicket?.sessoes || []

                if (!sessions.length) {
                  return <p className="empty-state-text">Ainda não há sessões registradas para este chamado.</p>
                }

                return sessions.map((session) => (
                  <article key={session.id} className="timeline-item">
                    <strong>
                      {session.tecnicoNome || 'Técnico'} {getSessionActionLabel(session).toLowerCase()} atendimento
                    </strong>
                    <p>Início: {formatDate(session.inicio)}</p>
                    <p>Término: {session.fim ? formatDate(session.fim) : '--'}</p>
                    <p>Tempo: {formatWorkedMinutes(session.tempoTrabalhado)}</p>
                    <p>Motivo da pausa: {session.motivoPausa || '--'}</p>
                    <p>Observação: {session.observacao || '--'}</p>
                  </article>
                ))
              })()}
            </div>
            <div className="ticket-modal-actions">
              <button type="button" className="btn-primary" onClick={() => setHistoryTicketId(null)}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}

export default TicketList
