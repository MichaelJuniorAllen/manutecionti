import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../services/api'
import { showToast } from '../components/Toast'

const statusClass = {
  Aberto: 'status-aberto',
  'Em andamento': 'status-em-andamento',
  Aguardando: 'status-aguardando',
  Concluído: 'status-concluido'
}

const priorityClass = {
  critica: 'priority-critica',
  alta: 'priority-alta',
  media: 'priority-media',
  baixa: 'priority-baixa'
}

export default function MyHistoryPage() {
  const navigate = useNavigate()
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadHistory() {
      setLoading(true)
      try {
        const response = await api.tickets.my()
        setTickets(response.tickets)
      } catch (error) {
        showToast(error.message, 'error')
      } finally {
        setLoading(false)
      }
    }

    loadHistory()
  }, [])

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>Meu histórico de chamados</h2>
          <p>Visualize rapidamente todas as solicitações abertas por você.</p>
        </div>
      </div>

      {loading ? (
        <div className="loading-panel">Carregando histórico...</div>
      ) : tickets.length ? (
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Título</th>
                <th>Status</th>
                <th>Prioridade</th>
                <th>Categoria</th>
                <th>Criado em</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((ticket) => (
                <tr key={ticket.id}>
                  <td>{ticket.id.slice(0, 8)}</td>
                  <td>{ticket.title}</td>
                  <td>
                    <span className={`badge ${statusClass[ticket.status]}`}>{ticket.status}</span>
                  </td>
                  <td>
                    <span className={`badge ${priorityClass[ticket.priority]}`}>{ticket.priority}</span>
                  </td>
                  <td>{ticket.category || '—'}</td>
                  <td>{new Date(ticket.created_at.replace(' ', 'T')).toLocaleString('pt-BR')}</td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => navigate(`/tickets/${ticket.id}`)}
                    >
                      Ver detalhe
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="empty-state">Você ainda não abriu chamados nesta conta.</p>
      )}
    </section>
  )
}
