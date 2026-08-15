import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../services/api'
import { showToast } from '../components/Toast'

const statusLabels = {
  Aberto: 'status-aberto',
  'Em andamento': 'status-em-andamento',
  Aguardando: 'status-aguardando',
  Concluído: 'status-concluido'
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const [tickets, setTickets] = useState([])
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadDashboard() {
      setLoading(true)
      try {
        const [ticketsResponse, reportResponse] = await Promise.all([
          api.tickets.list(),
          api.reports.yesterday()
        ])
        setTickets(ticketsResponse.tickets)
        setReport(reportResponse)
      } catch (error) {
        showToast(error.message, 'error')
      } finally {
        setLoading(false)
      }
    }

    loadDashboard()
  }, [])

  const stats = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    return {
      total: tickets.length,
      open: tickets.filter((ticket) => ticket.status === 'Aberto').length,
      inProgress: tickets.filter((ticket) => ticket.status === 'Em andamento').length,
      resolved: tickets.filter((ticket) => ticket.status === 'Concluído').length,
      today: tickets.filter((ticket) => ticket.created_at?.slice(0, 10) === today).length
    }
  }, [tickets])

  const recentTickets = tickets.slice(0, 5)

  if (loading) {
    return <div className="panel loading-panel">Carregando indicadores...</div>
  }

  return (
    <div className="page-stack">
      <section className="stats-grid">
        <article className="stat-card">
          <span>Total de tickets</span>
          <strong>{stats.total}</strong>
          <p>Visão consolidada de todos os chamados cadastrados.</p>
        </article>
        <article className="stat-card accent-blue">
          <span>Abertos</span>
          <strong>{stats.open}</strong>
          <p>Demandas aguardando primeiro atendimento.</p>
        </article>
        <article className="stat-card accent-orange">
          <span>Em andamento</span>
          <strong>{stats.inProgress}</strong>
          <p>Chamados atualmente em execução pela equipe.</p>
        </article>
        <article className="stat-card accent-green">
          <span>Resolvidos</span>
          <strong>{stats.resolved}</strong>
          <p>Tickets concluídos com sucesso.</p>
        </article>
      </section>

      <section className="grid-2">
        <article className="panel">
          <div className="panel-header">
            <div>
              <h2>Visão rápida</h2>
              <p>Volume do dia e recorte operacional.</p>
            </div>
            <button type="button" className="btn btn-secondary" onClick={() => navigate('/tickets/new')}>
              Novo Chamado
            </button>
          </div>

          <div className="summary-grid">
            <div className="summary-card">
              <span>Tickets hoje</span>
              <strong>{stats.today}</strong>
            </div>
            <div className="summary-card">
              <span>Aguardando</span>
              <strong>{tickets.filter((ticket) => ticket.status === 'Aguardando').length}</strong>
            </div>
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <h2>Resumo de ontem</h2>
              <p>Dados vindos do endpoint analítico do backend.</p>
            </div>
          </div>

          {report ? (
            <div className="report-inline">
              <div className="summary-card">
                <span>Data</span>
                <strong>{report.date}</strong>
              </div>
              <div className="summary-card">
                <span>Criados</span>
                <strong>{report.total_created}</strong>
              </div>
              <div className="summary-card">
                <span>Resolvidos</span>
                <strong>{report.total_resolved}</strong>
              </div>
            </div>
          ) : (
            <p className="empty-state">Nenhum relatório encontrado para ontem.</p>
          )}
        </article>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Chamados recentes</h2>
            <p>Últimas solicitações abertas no sistema.</p>
          </div>
          <button type="button" className="btn btn-primary" onClick={() => navigate('/tickets')}>
            Ver todos
          </button>
        </div>

        {recentTickets.length ? (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Título</th>
                  <th>Status</th>
                  <th>Prioridade</th>
                  <th>Criado por</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {recentTickets.map((ticket) => (
                  <tr key={ticket.id}>
                    <td>{ticket.id.slice(0, 8)}</td>
                    <td>{ticket.title}</td>
                    <td>
                      <span className={`badge ${statusLabels[ticket.status]}`}>{ticket.status}</span>
                    </td>
                    <td>{ticket.priority}</td>
                    <td>{ticket.created_by_name}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => navigate(`/tickets/${ticket.id}`)}
                      >
                        Detalhes
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty-state">Ainda não existem tickets cadastrados.</p>
        )}
      </section>
    </div>
  )
}
