import { useState } from 'react'
import { PRIORITY_OPTIONS } from '../utils/tickets'

const RESPONSIBLE_OPTIONS = ['TI', 'Manutenção']

const ALLOWED_TICKET_EMAILS = [
  'scihupacentral@maoamigacaxias.org.br',
  'nutricionistaupacentral@maoamigacaxias.org.br',
  'coordadmupacentral@maoamigacaxias.org.br',
  'coordinfraestruraupacentral@maoamigacaxias.org.br',
  'educacaocontinuadaupacentral@maoamigacaxias.org.br',
  'farmaceuticaclinicaupacentral@maoamigacaxias.org.br',
  'coordfarmaciaupacentral@maoamigacaxias.org.br',
  'diretorclinicoupacentral@maoamigacaxias.org.br',
  'coordmedicoupacentral@maoamigacaxias.org.br',
  'faturamentoupacentral@maoamigacaxias.org.br',
  'tiupacentral@maoamigacaxias.org.br',
  'manutencaoupacentral@maoamigacaxias.org.br',
  'sesmtupacentral@maoamigacaxias.org.br',
  'assistentesocialupacentral@maoamigacaxias.org.br',
  'recpcaoupacentral@maoamigacaxias.org.br',
  'enfermagemupacentral@maoamigacaxias.org.br',
  'odontologiaupacentral@maoamigacaxias.org.br',
  'coordenfermagemupacentral@maoamigacaxias.org.br',
]

function TicketForm({ onSubmitTicket, onNavigate }) {
  const [formValues, setFormValues] = useState({
    title: '',
    area: '',
    requester: '',
    corporateEmail: '',
    priority: 'media',
    responsible: '',
    description: '',
  })
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  function handleChange(event) {
    const { name, value } = event.target
    setFormValues((current) => ({ ...current, [name]: value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setLoading(true)

    try {
      await onSubmitTicket?.(formValues)
      setFormValues({
        title: '',
        area: '',
        requester: '',
        corporateEmail: '',
        priority: 'media',
        responsible: '',
        description: '',
      })
      setMessage('Seu chamado foi aberto com sucesso!')

      window.setTimeout(() => {
        onNavigate?.('/')
      }, 1200)
    } catch (error) {
      setMessage(error.message || 'Não foi possível registrar o chamado.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="form-container">
      <div className="form-panel">
        <div className="form-header">
          <div className="form-icon">📝</div>
          <h2>Preencha os dados do chamado</h2>
          <p>Forneça todas as informações necessárias para processar sua solicitação</p>
        </div>

        <form className="ticket-form" onSubmit={handleSubmit}>
          <div className="form-section">
            <h3>Descrição do problema</h3>
            <div className="field">
              <label htmlFor="title">Problema *</label>
              <input
                id="title"
                name="title"
                required
                placeholder="Ex.: Computador não liga"
                value={formValues.title}
                onChange={handleChange}
                className="form-input"
              />
            </div>
            <div className="field">
              <label htmlFor="description">Descrição detalhada *</label>
              <textarea
                id="description"
                name="description"
                required
                placeholder="Descreva o problema, local exato e impacto nas operações."
                value={formValues.description}
                onChange={handleChange}
                className="form-textarea"
              />
            </div>
          </div>

          <div className="form-section">
            <h3>Informações do solicitante</h3>
            <div className="row">
              <div className="field">
                <label htmlFor="area">Setor *</label>
                <input
                  id="area"
                  name="area"
                  required
                  placeholder="Ex.: Bloco A"
                  value={formValues.area}
                  onChange={handleChange}
                  className="form-input"
                />
              </div>
              <div className="field">
                <label htmlFor="requester">Solicitante *</label>
                <input
                  id="requester"
                  name="requester"
                  required
                  placeholder="Nome completo"
                  value={formValues.requester}
                  onChange={handleChange}
                  className="form-input"
                />
              </div>
            </div>
            <div className="field">
              <label htmlFor="corporateEmail">E-mail corporativo</label>
              <input
                id="corporateEmail"
                name="corporateEmail"
                type="email"
                placeholder="Digite seu e-mail (opcional)"
                value={formValues.corporateEmail}
                onChange={handleChange}
                className="form-input"
              />
            </div>
          </div>

          <div className="form-section">
            <h3>Detalhes da manutenção</h3>
            <div className="row">
              <div className="field">
                <label htmlFor="priority">Prioridade *</label>
                <select
                  id="priority"
                  name="priority"
                  required
                  value={formValues.priority}
                  onChange={handleChange}
                  className="form-input"
                >
                  {PRIORITY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="responsible">Responsável</label>
                <select
                  id="responsible"
                  name="responsible"
                  value={formValues.responsible}
                  onChange={handleChange}
                  className="form-input"
                >
                  <option value="">Selecione</option>
                  {RESPONSIBLE_OPTIONS.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="form-actions">
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Registrando...' : '✓ Registrar chamado'}
            </button>
            <button type="reset" className="btn-secondary">⟲ Limpar formulário</button>
          </div>

          {message && <div className="form-message">{message}</div>}
        </form>
      </div>
    </section>
  )
}

export default TicketForm
