import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../services/api'
import { showToast } from '../components/Toast'

const categories = ['Hardware', 'Software', 'Rede', 'Acesso', 'Financeiro', 'Segurança', 'Outros']
const priorities = ['critica', 'alta', 'media', 'baixa']

export default function NewTicketPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    title: '',
    description: '',
    priority: 'media',
    category: 'Software'
  })
  const [submitting, setSubmitting] = useState(false)

  function handleChange(event) {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setSubmitting(true)

    try {
      const response = await api.tickets.create(form)
      showToast('Chamado criado com sucesso.', 'success')
      navigate(`/tickets/${response.ticket.id}`)
    } catch (error) {
      showToast(error.message, 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="panel narrow-panel">
      <div className="panel-header">
        <div>
          <h2>Novo chamado</h2>
          <p>Registre uma nova demanda para acompanhamento da equipe.</p>
        </div>
      </div>

      <form className="form-card" onSubmit={handleSubmit}>
        <label className="field">
          <span>Título</span>
          <input
            name="title"
            value={form.title}
            onChange={handleChange}
            placeholder="Ex.: Falha no login do ERP"
            required
          />
        </label>

        <label className="field">
          <span>Descrição</span>
          <textarea
            name="description"
            value={form.description}
            onChange={handleChange}
            placeholder="Descreva o problema com o máximo de contexto possível."
            rows="6"
            required
          />
        </label>

        <div className="form-grid two-columns">
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
        </div>

        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={() => navigate('/tickets')}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Salvando...' : 'Criar chamado'}
          </button>
        </div>
      </form>
    </section>
  )
}
