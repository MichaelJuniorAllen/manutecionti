import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import TicketChat from '../components/TicketChat'

function ChatPage() {
  const { ticketId } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const queryToken = searchParams.get('token') || ''
  const storageKey = `ticket-chat-token-${ticketId}`
  const [accessToken, setAccessToken] = useState(() => queryToken || sessionStorage.getItem(storageKey) || '')

  useEffect(() => {
    const token = queryToken || sessionStorage.getItem(storageKey) || ''
    setAccessToken(token)
    if (queryToken) {
      sessionStorage.setItem(storageKey, queryToken)
      navigate(`/chat/${encodeURIComponent(ticketId)}`, { replace: true })
    }
  }, [navigate, queryToken, storageKey, ticketId])

  return (
    <div className="ticket-chat-page">
      {accessToken ? (
        <TicketChat
          publicTicketId={ticketId}
          accessToken={accessToken}
          standalone
          onClose={() => navigate('/')}
        />
      ) : (
        <div className="ticket-chat-invalid" role="alert">
          <h2>Link de conversa inválido</h2>
          <p>Abra o link seguro recebido no e-mail para acessar o chat deste chamado.</p>
          <button type="button" className="secondary" onClick={() => navigate('/')}>Voltar ao início</button>
        </div>
      )}
    </div>
  )
}

export default ChatPage
