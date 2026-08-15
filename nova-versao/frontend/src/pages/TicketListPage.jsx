import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../services/api'
import { showToast } from '../components/Toast'
import { useAuth } from '../context/AuthContext'

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

export default function TicketListPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ status: '', priority: '', search: '' })

  useEffect(() => {
    async function loadTickets() {
      setLoading(true)
      try {
        const response = await api.tickets.list(filters)
        setTickets(response.tickets)
      } catch (error) {
        showToast(error.message, 'error')
      } finally {
        setLoading(false)
      }
    }

    loadTickets()
  }, [filters])

  async function handleDelete(ticketId) {
    const confirmed = window.confirm('Deseja realmente excluir este chamado?')
    if (!confirmed) {
      return
    }

    try {
      await api.tickets.delete(ticketId)
      setTickets((current) => current.filter((ticket) => ticket.id !== ticketId))
      showToast('Chamado removido com sucesso.', 'success')
    } catch (error) {
      showToast(error.message, 'error')
    }
  }

  function updateFilter(event) {
    const { name, value } = event.target
    setFilters((current) => ({ ...current, [name]: value }))
  }


  return (
    <section className="panel">
      <div className="panel-header panel-header-wrap">
        <div>
          <h2>Fila completa de chamados</h2>
          <p>Filtre por status, prioridade ou texto livre para localizar registros.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => navigate('/tickets/new')}>
          Novo Chamado
        </button>
      </div>

      <div className="filter-bar">
        <label className="field compact-field">
          <span>Status</span>
          <select name="status" value={filters.status} onChange={updateFilter}>
            <option value="">Todos</option>
            <option value="Aberto">Aberto</option>
            <option value="Em andamento">Em andamento</option>
            <option value="Aguardando">Aguardando</option>
            <option value="Concluído">Concluído</option>
          </select>
        </label>

        <label className="field compact-field">
          <span>Prioridade</span>
          <select name="priority" value={filters.priority} onChange={updateFilter}>
            <option value="">Todas</option>
            <option value="critica">critica</option>
            <option value="alta">alta</option>
            <option value="media">media</option>
            <option value="baixa">baixa</option>
          </select>
        </label>

        <label className="field search-field">
          <span>Buscar</span>
          <input
            name="search"
            value={filters.search}
            onChange={updateFilter}
            placeholder="Título, categoria, descrição ou solicitante"
          />
        </label>
      </div>

      {loading ? (
        <div className="loading-panel">Carregando chamados...</div>
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
                <th>Criado por</th>
                <th>Criado em</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((ticket) => {
                const canDelete = user?.role === 'admin' || user?.id === ticket.created_by
                return (
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
                    <td>{ticket.created_by_name}</td>
                    <td>{new Date(ticket.created_at.replace(' ', 'T')).toLocaleString('pt-BR')}</td>
                    <td>
                      <div className="table-actions">
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => navigate(`/tickets/${ticket.id}`)}
                        >
                          Ver
                        </button>
                        {canDelete ? (
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            onClick={() => handleDelete(ticket.id)}
                          >
                            Excluir
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="empty-state">Nenhum chamado encontrado com os filtros selecionados.</p>
      )}
    </section>
  )
}
