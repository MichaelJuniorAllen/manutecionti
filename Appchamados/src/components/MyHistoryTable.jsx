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
              <th>Observações</th>
            </tr>
          </thead>
          <tbody>
            {!rows.length ? (
              <tr>
                <td colSpan={9} className="empty-cell">Nenhum chamado encontrado para os filtros atuais.</td>
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
