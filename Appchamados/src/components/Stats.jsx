function Stats({ tickets }) {
  const total = tickets.length
  const open = tickets.filter((ticket) => ticket.status === 'Aberto').length
  const closed = tickets.filter((ticket) => ticket.status === 'Concluído').length

  return (
    <section className="stats" aria-label="Resumo">
      <div className="stat"><small>Totais</small><strong>{total}</strong></div>
      <div className="stat"><small>Abertos</small><strong>{open}</strong></div>
      <div className="stat"><small>Concluídos</small><strong>{closed}</strong></div>
    </section>
  )
}

export default Stats
