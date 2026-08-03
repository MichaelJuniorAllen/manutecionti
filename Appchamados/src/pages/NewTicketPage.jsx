import { useNavigate } from 'react-router-dom'
import TicketForm from '../components/TicketForm'
import { api } from '../services/api'

function NewTicketPage({ onNotify }) {
  const navigate = useNavigate()

  async function handleSubmitTicket(values, options = {}) {
    await api.tickets.create({
      titulo: values.title,
      descricao: values.description,
      area: values.area,
      solicitante: values.requester,
      emailCorporativo: values.corporateEmail,
      prioridade: values.priority,
      tecnicoResponsavel: values.responsible,
      observacoes: values.description,
      clientRequestId: options.clientRequestId || '',
    })
    onNotify('success', 'Seu chamado foi aberto com sucesso!')
  }

  return <TicketForm onSubmitTicket={handleSubmitTicket} onNavigate={(path) => navigate(path)} />
}

export default NewTicketPage