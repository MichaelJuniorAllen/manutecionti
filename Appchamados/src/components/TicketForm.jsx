import { useRef, useState } from 'react'
import { PRIORITY_OPTIONS } from '../utils/tickets'

const RESPONSIBLE_OPTIONS = [
  { value: 'TI', description: 'Computadores, sistemas, acessos e problemas de tecnologia.' },
  { value: 'Manutenção', description: 'Estrutura, elétrica, hidráulica e manutenção geral.' },
  { value: 'Engenharia Clínica', description: 'Equipamentos médico-hospitalares e clínicos.' },
]

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
    priority: 'media',
    responsible: '',
    description: '',
  })
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [priorityOpen, setPriorityOpen] = useState(false)
  const [responsibleOpen, setResponsibleOpen] = useState(false)
  const submitLockRef = useRef(false)
  const submitRequestIdRef = useRef('')

  function handleChange(event) {
    const { name, value } = event.target
    setFormValues((current) => ({ ...current, [name]: value }))
  }

  function handlePriorityChange(value) {
    setFormValues((current) => ({ ...current, priority: value }))
    setPriorityOpen(false)
  }

  function handleResponsibleChange(value) {
    setFormValues((current) => ({ ...current, responsible: value }))
    setResponsibleOpen(false)
  }

  const selectedPriority = PRIORITY_OPTIONS.find((option) => option.value === formValues.priority)
  const selectedResponsible = RESPONSIBLE_OPTIONS.find((option) => option.value === formValues.responsible)

  async function handleSubmit(event) {
    event.preventDefault()
    const requiredValues = [formValues.title, formValues.description, formValues.area, formValues.requester, formValues.priority, formValues.responsible]
    if (requiredValues.some((value) => !String(value).trim())) {
      setMessage('Preencha todos os campos obrigatórios antes de registrar o chamado.')
      return
    }
    if (submitLockRef.current) return
    submitLockRef.current = true
    setLoading(true)

    if (!submitRequestIdRef.current) {
      submitRequestIdRef.current = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`
    }

    try {
      await onSubmitTicket?.(formValues, { clientRequestId: submitRequestIdRef.current })
      setFormValues({
        title: '',
        area: '',
        requester: '',
        priority: 'media',
        responsible: '',
        description: '',
      })
      submitRequestIdRef.current = ''
      setMessage('Seu chamado foi aberto com sucesso!')

      window.setTimeout(() => {
        onNavigate?.('/')
      }, 1200)
    } catch (error) {
      setMessage(error.message || 'Não foi possível registrar o chamado.')
    } finally {
      setLoading(false)
      submitLockRef.current = false
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
          </div>

          <div className="form-section">
            <h3>Detalhes da manutenção</h3>
            <div className="row">
              <div className="field">
                <label htmlFor="priority">Prioridade *</label>
                <div className="priority-picker">
                  <button
                    id="priority"
                    type="button"
                    className={`priority-picker-button priority-picker-${selectedPriority?.value || 'media'}`}
                    aria-haspopup="listbox"
                    aria-expanded={priorityOpen}
                    onClick={() => setPriorityOpen((open) => !open)}
                  >
                    <span>
                      <strong>{selectedPriority?.label}</strong>
                      <small>{selectedPriority?.description}</small>
                    </span>
                    <span className="priority-picker-arrow" aria-hidden="true">▾</span>
                  </button>
                  {priorityOpen && (
                    <div className="priority-picker-options" role="listbox" aria-label="Escolha a prioridade">
                      {PRIORITY_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          role="option"
                          aria-selected={option.value === formValues.priority}
                          className={`priority-picker-option priority-picker-${option.value}`}
                          onClick={() => handlePriorityChange(option.value)}
                        >
                          <strong>{option.label}</strong>
                          <small>{option.description}</small>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="field">
                <label htmlFor="responsible">Responsável *</label>
                <div className="responsible-picker">
                  <button
                    id="responsible"
                    type="button"
                    className={`responsible-picker-button responsible-picker-${selectedResponsible ? 'selected' : 'empty'}`}
                    aria-haspopup="listbox"
                    aria-expanded={responsibleOpen}
                    onClick={() => setResponsibleOpen((open) => !open)}
                  >
                    <span>
                      <strong>{selectedResponsible?.value || 'Selecione'}</strong>
                      <small>{selectedResponsible?.description || 'Escolha a equipe responsável pelo atendimento.'}</small>
                    </span>
                    <span className="priority-picker-arrow" aria-hidden="true">▾</span>
                  </button>
                  {responsibleOpen && (
                    <div className="responsible-picker-options" role="listbox" aria-label="Escolha o responsável">
                      {RESPONSIBLE_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          role="option"
                          aria-selected={option.value === formValues.responsible}
                          className="responsible-picker-option"
                          onClick={() => handleResponsibleChange(option.value)}
                        >
                          <strong>{option.value}</strong>
                          <small>{option.description}</small>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
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
