import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../services/api'

function formatMessageDate(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

function TicketChat({ ticket, publicTicketId = '', accessToken = '', standalone = false, onClose }) {
  const ticketId = publicTicketId || ticket?.id
  const [conversation, setConversation] = useState(null)
  const [messageText, setMessageText] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const messagesEndRef = useRef(null)

  const loadConversation = useCallback(async (showLoading = false) => {
    if (!ticketId) return
    if (showLoading) setLoading(true)
    try {
      const result = await api.tickets.chat(ticketId, accessToken ? { token: accessToken } : {})
      setConversation(result)
      setError('')
    } catch (loadError) {
      setError(loadError.message || 'Não foi possível carregar a conversa.')
    } finally {
      setLoading(false)
    }
  }, [accessToken, ticketId])

  useEffect(() => {
    loadConversation(true)
    const interval = window.setInterval(() => loadConversation(), 5000)
    return () => window.clearInterval(interval)
  }, [loadConversation])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [conversation?.messages?.length])

  async function handleSubmit(event) {
    event.preventDefault()
    const text = messageText.trim()
    if (!text || sending) return

    setSending(true)
    setError('')
    setNotice('')
    try {
      const result = await api.tickets.sendChatMessage(
        ticketId,
        text,
        accessToken ? { token: accessToken } : {},
      )
      setMessageText('')
      setConversation((current) => current
        ? { ...current, messages: [...current.messages, result.message] }
        : current)
      if (!standalone && result.emailSent === false && result.emailError) {
        setNotice(result.emailError)
      } else if (!standalone && result.emailSent === true) {
        setNotice('Mensagem enviada e notificação por e-mail entregue.')
      }
    } catch (sendError) {
      setError(sendError.message || 'Não foi possível enviar a mensagem.')
    } finally {
      setSending(false)
    }
  }

  const details = conversation?.ticket || ticket
  const isPublicRequester = Boolean(accessToken)

  return (
    <section className={`ticket-chat ${standalone ? 'ticket-chat-standalone' : 'ticket-chat-floating'}`} aria-label="Chat do chamado">
      <header className="ticket-chat-header">
        <div>
          <strong>Chat do chamado</strong>
          <small>
            {details?.numeroChamado ? `#${details.numeroChamado}` : 'Conversa segura'}
            {details?.emailSolicitante ? ` · ${details.emailSolicitante}` : ''}
          </small>
        </div>
        <button type="button" className="ticket-chat-close" onClick={onClose} aria-label="Fechar chat" title="Fechar">
          ×
        </button>
      </header>

      <div className="ticket-chat-context">
        <span><strong>Chamado:</strong> {details?.titulo || 'Carregando chamado...'}</span>
        <span><strong>De:</strong> Equipe de atendimento (e-mail do sistema)</span>
        <span><strong>{isPublicRequester ? 'Conversa com:' : 'Para:'}</strong> {isPublicRequester ? 'Equipe de atendimento' : details?.emailSolicitante || 'Solicitante'}</span>
      </div>

      <div className="ticket-chat-messages" aria-live="polite">
        {loading ? <p className="ticket-chat-empty">Carregando conversa...</p> : null}
        {!loading && conversation?.messages?.length === 0 ? (
          <p className="ticket-chat-empty">Ainda não há mensagens. Escreva para iniciar a conversa.</p>
        ) : null}
        {conversation?.messages?.map((message) => {
          const ownMessage = isPublicRequester
            ? message.authorType === 'requester'
            : message.authorType === 'staff'
          return (
            <article key={message.id} className={`ticket-chat-message ${ownMessage ? 'is-own' : ''}`}>
              <span className="ticket-chat-author">{message.authorName || (message.authorType === 'staff' ? 'Equipe' : 'Solicitante')}</span>
              <p>{message.text}</p>
              <time dateTime={message.createdAt}>{formatMessageDate(message.createdAt)}</time>
            </article>
          )
        })}
        <div ref={messagesEndRef} />
      </div>

      {error ? <p className="ticket-chat-feedback error" role="alert">{error}</p> : null}
      {notice ? <p className="ticket-chat-feedback" role="status">{notice}</p> : null}

      <form className="ticket-chat-composer" onSubmit={handleSubmit}>
        <textarea
          aria-label="Escreva sua mensagem"
          placeholder="Escreva uma mensagem..."
          value={messageText}
          maxLength={5000}
          onChange={(event) => setMessageText(event.target.value)}
          disabled={loading || sending || Boolean(error)}
          rows={2}
        />
        <button type="submit" disabled={loading || sending || !messageText.trim() || Boolean(error)}>
          {sending ? 'Enviando...' : 'Enviar'}
        </button>
      </form>
    </section>
  )
}

export default TicketChat
