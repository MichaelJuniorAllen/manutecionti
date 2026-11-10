import { useNavigate } from 'react-router-dom'
import TicketForm from '../components/TicketForm'
import { api } from '../services/api'

function NewTicketPage({ onNotify }) {
  const navigate = useNavigate()

  async function handleSubmitTicket(values, options = {}) {
    const result = await api.tickets.create({
      titulo: values.title,
      descricao: values.description,
      area: values.area,
      solicitante: values.requester,
      emailSolicitante: values.emailSolicitante,
      prioridade: values.priority,
      tecnicoResponsavel: values.responsible,
      observacoes: values.description,
      clientRequestId: options.clientRequestId || '',
    })
    if (values.emailSolicitante && result.emailSent === false) {
      onNotify('warning', result.emailError || 'Chamado registrado, mas não foi possível enviar o e-mail.')
    } else {
      onNotify('success', 'Seu chamado foi aberto com sucesso!')
    }

    return {
      ...result,
      chatUrl: result.chatAccessToken
        ? `/chat/${encodeURIComponent(result.ticket.id)}?token=${encodeURIComponent(result.chatAccessToken)}`
        : '',
    }
  }

  return <TicketForm onSubmitTicket={handleSubmitTicket} onNavigate={(path) => navigate(path)} />
}

export default NewTicketPage