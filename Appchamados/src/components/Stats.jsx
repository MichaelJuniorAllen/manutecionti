function Stats({ tickets }) {
  const total = tickets.length
  const open = tickets.filter((ticket) => ticket.status === 'Aberto').length
  const closed = tickets.filter((ticket) => ticket.status === 'Concluído').length
  const pending = tickets.filter((ticket) => ticket.status === 'Em andamento').length

  return (
    <section className="stats stats-four" aria-label="Resumo">
      <div className="stat"><small>Totais</small><strong>{total}</strong></div>
      <div className="stat"><small>Abertos</small><strong>{open}</strong></div>
      <div className="stat"><small>Pendentes</small><strong>{pending}</strong></div>
      <div className="stat"><small>Concluídos</small><strong>{closed}</strong></div>
    </section>
  )
}

export default Stats
