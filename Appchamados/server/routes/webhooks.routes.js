import express from 'express'
import { randomUUID, timingSafeEqual } from 'node:crypto'
import { mutateDatabase, nowIso } from '../services/database.js'
import { getEmailAddress, getInboundMessageText, parseTicketReplyRecipient } from '../services/inbound-email.js'
import { isInboundEmailConfigured } from '../services/mailer.js'
import { getResendReceivedEmail, verifyResendWebhook } from '../services/resend.js'

const router = express.Router()
const CHAT_MESSAGE_MAX_LENGTH = 5000
const inboundDomain = String(process.env.RESEND_INBOUND_DOMAIN || '').trim().toLowerCase()

router.post('/resend', express.raw({ type: 'application/json', limit: '256kb' }), async (req, res) => {
  if (!isInboundEmailConfigured()) {
    return res.status(503).json({ message: 'Recepção de respostas por e-mail não está configurada.' })
  }

  if (!Buffer.isBuffer(req.body)) {
    return res.status(400).json({ message: 'Payload de webhook inválido.' })
  }

  let event
  try {
    event = verifyResendWebhook(req.body.toString('utf8'), {
      id: req.get('svix-id'),
      timestamp: req.get('svix-timestamp'),
      signature: req.get('svix-signature'),
    }, process.env.RESEND_WEBHOOK_SECRET)
  } catch {
    return res.status(401).json({ message: 'Assinatura do webhook inválida.' })
  }

  if (event?.type !== 'email.received') {
    return res.json({ received: true })
  }

  const emailId = String(event.data?.email_id || '')
  const recipients = Array.isArray(event.data?.to) ? event.data.to : []
  const replyRecipients = recipients
    .map((recipient) => parseTicketReplyRecipient(getEmailAddress(recipient), inboundDomain))
    .filter(Boolean)
  const replyKeys = [...new Set(replyRecipients.map(({ ticketId, replyKey }) => `${ticketId}:${replyKey}`))]

  if (!emailId || replyKeys.length !== 1) {
    return res.json({ received: true, ignored: true })
  }

  try {
    const email = await getResendReceivedEmail(emailId)
    const { ticketId, replyKey } = replyRecipients[0]
    const replyAddress = `ticket-${ticketId}-${replyKey}@${inboundDomain}`
    const emailRecipients = Array.isArray(email.to) ? email.to : []
    const hasExpectedRecipient = emailRecipients.some((recipient) => (
      getEmailAddress(recipient) === replyAddress
    ))
    const senderEmail = getEmailAddress(email.from)
    const text = getInboundMessageText(email, CHAT_MESSAGE_MAX_LENGTH)

    if (!hasExpectedRecipient || !senderEmail || !text) {
      return res.json({ received: true, ignored: true })
    }

    let outcome = 'ignored'
    await mutateDatabase(async (db) => {
      const ticket = db.chamados.find((item) => String(item.id) === ticketId)
      if (!ticket || String(ticket.email_solicitante || '').trim().toLowerCase() !== senderEmail) {
        return
      }

      const expectedReplyKey = String(ticket.chat_access_token || '').slice(0, 32).toLowerCase()
      const expectedKeyBuffer = Buffer.from(expectedReplyKey)
      const providedKeyBuffer = Buffer.from(replyKey)
      if (expectedKeyBuffer.length !== providedKeyBuffer.length || !timingSafeEqual(expectedKeyBuffer, providedKeyBuffer)) {
        return
      }

      if (!Array.isArray(ticket.chat_messages)) {
        ticket.chat_messages = []
      }
      if (ticket.chat_messages.some((message) => message.source_email_id === emailId)) {
        outcome = 'duplicate'
        return
      }

      ticket.chat_messages.push({
        id: randomUUID(),
        author_type: 'requester',
        author_id: null,
        author_name: ticket.solicitante || 'Solicitante',
        text,
        created_at: nowIso(),
        source_email_id: emailId,
      })
      outcome = 'inserted'
    })

    return res.json({ received: true, duplicate: outcome === 'duplicate' })
  } catch (error) {
    console.error('[WEBHOOK RESEND] Não foi possível processar o e-mail recebido:', error.message)
    return res.status(500).json({ message: 'Não foi possível processar o e-mail recebido.' })
  }
})

export default router
