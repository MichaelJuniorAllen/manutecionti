import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../services/api'
import { showToast } from '../components/Toast'

const categories = ['Hardware', 'Software', 'Rede', 'Acesso', 'Financeiro', 'Segurança', 'Outros']
const statuses = ['Aberto', 'Em andamento', 'Aguardando', 'Concluído']
const priorities = ['critica', 'alta', 'media', 'baixa']

export default function TicketDetailPage() {
  const navigate = useNavigate()
  const { id } = useParams()
  const [ticket, setTicket] = useState(null)
  const [form, setForm] = useState({
    title: '',
    description: '',
    priority: 'media',
    status: 'Aberto',
    category: 'Software'
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function loadTicket() {
      setLoading(true)
      try {
        const response = await api.tickets.get(id)
        const currentTicket = response.ticket
        setTicket(currentTicket)
        setForm({
          title: currentTicket.title,
          description: currentTicket.description,
          priority: currentTicket.priority,
          status: currentTicket.status,
          category: currentTicket.category || 'Outros'
        })
      } catch (error) {
        showToast(error.message, 'error')
      } finally {
        setLoading(false)
      }
    }

    loadTicket()
  }, [id])

  function handleChange(event) {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
  }

  async function handleSave(event) {
    event.preventDefault()
    setSaving(true)
    try {
      const response = await api.tickets.update(id, form)
      setTicket(response.ticket)
      showToast('Chamado atualizado com sucesso.', 'success')
    } catch (error) {
      showToast(error.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!window.confirm('Deseja realmente excluir este chamado?')) {
      return
    }

    try {
      await api.tickets.delete(id)
      showToast('Chamado excluído com sucesso.', 'success')
      navigate('/tickets')
    } catch (error) {
      showToast(error.message, 'error')
    }
  }

  if (loading) {
    return <div className="panel loading-panel">Carregando detalhes do chamado...</div>
  }

  if (!ticket) {
    return <div className="panel empty-state">Chamado não encontrado.</div>
  }

  return (
    <div className="page-stack">
      <section className="panel">
        <div className="panel-header panel-header-wrap">
          <div>
            <h2>{ticket.title}</h2>
            <p>Solicitação aberta por {ticket.created_by_name} em {new Date(ticket.created_at.replace(' ', 'T')).toLocaleString('pt-BR')}.</p>
          </div>
          <div className="panel-actions">
            <button type="button" className="btn btn-secondary" onClick={() => navigate('/tickets')}>
              Voltar
            </button>
            <button type="button" className="btn btn-danger" onClick={handleDelete}>
              Excluir
            </button>
          </div>
        </div>

        <div className="ticket-meta-grid">
          <div className="meta-card">
            <span>Status atual</span>
            <strong>{ticket.status}</strong>
          </div>
          <div className="meta-card">
            <span>Prioridade</span>
            <strong>{ticket.priority}</strong>
          </div>
          <div className="meta-card">
            <span>Categoria</span>
            <strong>{ticket.category || 'Não informada'}</strong>
          </div>
          <div className="meta-card">
            <span>Fechado em</span>
            <strong>{ticket.closed_at ? new Date(ticket.closed_at.replace(' ', 'T')).toLocaleString('pt-BR') : 'Ainda aberto'}</strong>
          </div>
        </div>
      </section>

      <section className="panel narrow-panel">
        <div className="panel-header">
          <div>
            <h2>Editar chamado</h2>
            <p>Atualize conteúdo, classificação e andamento operacional.</p>
          </div>
        </div>

        <form className="form-card" onSubmit={handleSave}>
          <label className="field">
            <span>Título</span>
            <input name="title" value={form.title} onChange={handleChange} required />
          </label>

          <label className="field">
            <span>Descrição</span>
            <textarea
              name="description"
              value={form.description}
              onChange={handleChange}
              rows="6"
              required
            />
          </label>

          <div className="form-grid two-columns">
            <label className="field">
              <span>Status</span>
              <select name="status" value={form.status} onChange={handleChange}>
                {statuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Prioridade</span>
              <select name="priority" value={form.priority} onChange={handleChange}>
                {priorities.map((priority) => (
                  <option key={priority} value={priority}>
                    {priority}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="field">
            <span>Categoria</span>
            <select name="category" value={form.category} onChange={handleChange}>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>

          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar alterações'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
