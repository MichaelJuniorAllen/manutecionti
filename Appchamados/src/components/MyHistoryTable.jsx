import { useMemo } from 'react'

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

function MyHistoryTable({ tickets }) {
  const rows = useMemo(() => tickets || [], [tickets])

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
              <th>Data de fechamento</th>
              <th>Tempo total</th>
              <th>Tempo de andamento</th>
              <th>Observações</th>
            </tr>
          </thead>
          <tbody>
            {!rows.length ? (
              <tr>
                <td colSpan={10} className="empty-cell">Nenhum chamado encontrado para os filtros atuais.</td>
              </tr>
            ) : (
              rows.map((ticket) => (
                <tr key={ticket.id}>
                  <td>{ticket.numeroChamado}</td>
                  <td>{formatDate(ticket.dataAbertura)}</td>
                  <td>{ticket.area}</td>
                  <td>{ticket.prioridade}</td>
                  <td>{ticket.status}</td>
                  <td>{ticket.tecnicoResponsavel}</td>
                  <td>{formatDate(ticket.dataFechamento)}</td>
                  <td>{formatResolution(ticket.tempoResolucao)}</td>
                  <td>{getInProgressDisplay(ticket)}</td>
                  <td>{ticket.observacoes || '--'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default MyHistoryTable
