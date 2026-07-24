import { useMemo, useState } from 'react'

function formatDate(value) {
  if (!value) return '--'
  return new Date(value).toLocaleString('pt-BR')
}

function formatResolution(minutes) {
  if (!Number.isFinite(minutes) || minutes < 0) return '--'
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    return `${h}h ${m}m`
  }
  return `${minutes} min`
}

function formatElapsedSeconds(startAt, endAt) {
  if (!startAt || !endAt) return '--'

  const start = new Date(startAt).getTime()
  const end = new Date(endAt).getTime()

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

function getInProgressDisplay(ticket) {
  const byDates = formatElapsedSeconds(ticket?.dataAtendimento, ticket?.dataFechamento)
  if (byDates !== '--') {
    return byDates
  }

  return formatResolution(ticket?.tempoAndamento)
}

function formatSessionAction(session) {
  if (!session) return '--'
  if (session.status === 'Concluído') return 'Concluiu'
  if (session.status === 'Pausado') return 'Pausou'
  if (session.status === 'Em andamento') {
    return session.tipoInicio === 'Retomado' ? 'Retomou' : 'Iniciou'
  }
  return session.status || '--'
}

function formatSessionsCount(count) {
  const safeCount = Number(count)
  if (!Number.isFinite(safeCount) || safeCount <= 0) return '0 sessões'
  if (safeCount === 1) return '1 sessão'
  return `${safeCount} sessões`
}

function MyHistoryTable({ tickets, currentUserId = '' }) {
  const rows = useMemo(() => tickets || [], [tickets])
  const [expandedRows, setExpandedRows] = useState(() => new Set())

  function toggleRow(ticketId) {
    setExpandedRows((current) => {
      const next = new Set(current)
      if (next.has(ticketId)) {
        next.delete(ticketId)
      } else {
        next.add(ticketId)
      }
      return next
    })
  }

  function getWorkedByTechnician(ticket) {
    const sessions = ticket?.sessoes || []
    const total = sessions.reduce((acc, session) => {
      if (String(session?.tecnicoId || '') !== String(currentUserId || '')) return acc
      const value = Number(session?.tempoTrabalhado)
      return Number.isFinite(value) && value > 0 ? acc + value : acc
    }, 0)

    return formatResolution(total)
  }

  return (
    <section className="panel history-table-wrap">
      <div className="history-scroll">
        <table className="history-table">
          <thead>
            <tr>
              <th>Número</th>
              <th>Data de abertura</th>
              <th>Área</th>
              <th>Prioridade</th>
              <th>Status</th>
              <th>Técnico</th>
              <th>Detalhes</th>
              <th>Tempo trabalhado pelo técnico</th>
              <th>Última ação</th>
              <th>Sessões</th>
              <th>Data de fechamento</th>
              <th>Tempo total</th>
              <th>Tempo de andamento</th>
              <th>Observações</th>
            </tr>
          </thead>
          <tbody>
            {!rows.length ? (
              <tr>
                <td colSpan={14} className="empty-cell">Nenhum chamado encontrado para os filtros atuais.</td>
              </tr>
            ) : (
              rows.map((ticket) => {
                const sessions = ticket?.sessoes || []
                const lastSession = sessions.length ? sessions[sessions.length - 1] : null
                const isExpanded = expandedRows.has(ticket.id)

                return [
                  (
                    <tr key={ticket.id}>
                      <td>{ticket.numeroChamado}</td>
                      <td>{formatDate(ticket.dataAbertura)}</td>
                      <td>{ticket.area}</td>
                      <td>{ticket.prioridade}</td>
                      <td>{ticket.status}</td>
                      <td>{ticket.tecnicoResponsavel}</td>
                      <td>{formatSessionsCount(ticket.totalSessoes ?? sessions.length)}</td>
                      <td>{getWorkedByTechnician(ticket)}</td>
                      <td>{formatSessionAction(lastSession)}</td>
                      <td>
                        <button
                          type="button"
                          className="table-expand-btn"
                          onClick={() => toggleRow(ticket.id)}
                          title="Expandir sessões"
                        >
                          {isExpanded ? '▲' : '▼'}
                        </button>
                      </td>
                      <td>{formatDate(ticket.dataFechamento)}</td>
                      <td>{formatResolution(ticket.tempoResolucao)}</td>
                      <td>{getInProgressDisplay(ticket)}</td>
                      <td>{ticket.observacoes || '--'}</td>
                    </tr>
                  ),
                  isExpanded ? (
                    <tr className="history-session-row" key={`${ticket.id}-sessions`}>
                      <td colSpan={14}>
                        <div className="history-session-list">
                          {!sessions.length ? (
                            <p>Nenhuma sessão registrada.</p>
                          ) : (
                            sessions.map((session) => (
                              <article key={session.id} className="history-session-item">
                                <strong>{session.tecnicoNome || 'Técnico'} • {formatSessionAction(session)}</strong>
                                <p>{formatDate(session.inicio)} - {formatDate(session.fim)}</p>
                                <p>Tempo: {formatResolution(session.tempoTrabalhado)}</p>
                                <p>Motivo: {session.motivoPausa || '--'}</p>
                                <p>Observação: {session.observacao || '--'}</p>
                              </article>
                            ))
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : null,
                ]
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default MyHistoryTable
