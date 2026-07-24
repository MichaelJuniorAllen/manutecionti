function formatMinutes(minutes) {
  if (!Number.isFinite(minutes) || minutes <= 0) return '0min'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h > 0) return `${h}h ${m}min`
  return `${m}min`
}

function Stats({ tickets, currentUserId = '' }) {
  const total = tickets.length
  const open = tickets.filter((ticket) => ticket.status === 'Aberto').length
  const closed = tickets.filter((ticket) => ticket.status === 'Concluído').length
  const pending = tickets.filter((ticket) => ticket.status === 'Em andamento' || ticket.status === 'Aguardando Continuação').length

  const sessions = tickets.flatMap((ticket) => ticket?.sessoes || [])
  const mySessions = sessions.filter((session) => String(session?.tecnicoId || '') === String(currentUserId || ''))

  const started = mySessions.length
  const paused = mySessions.filter((session) => session?.status === 'Pausado').length
  const resumed = mySessions.filter((session) => session?.tipoInicio === 'Retomado').length
  const concluded = mySessions.filter((session) => session?.status === 'Concluído').length

  const workedMinutes = mySessions.reduce((acc, session) => {
    const value = Number(session?.tempoTrabalhado)
    return Number.isFinite(value) && value > 0 ? acc + value : acc
  }, 0)

  const avgSessionMinutes = concluded > 0 ? Math.round(workedMinutes / concluded) : 0

  return (
    <section className="stats stats-extended" aria-label="Resumo">
      <div className="stat"><small>Totais</small><strong>{total}</strong></div>
      <div className="stat"><small>Abertos</small><strong>{open}</strong></div>
      <div className="stat"><small>Pendentes</small><strong>{pending}</strong></div>
      <div className="stat"><small>Concluídos</small><strong>{closed}</strong></div>
      <div className="stat"><small>Chamados iniciados</small><strong>{started}</strong></div>
      <div className="stat"><small>Chamados pausados</small><strong>{paused}</strong></div>
      <div className="stat"><small>Chamados retomados</small><strong>{resumed}</strong></div>
      <div className="stat"><small>Sessões concluídas</small><strong>{concluded}</strong></div>
      <div className="stat"><small>Horas trabalhadas</small><strong>{formatMinutes(workedMinutes)}</strong></div>
      <div className="stat"><small>Média por atendimento</small><strong>{formatMinutes(avgSessionMinutes)}</strong></div>
    </section>
  )
}

export default Stats
