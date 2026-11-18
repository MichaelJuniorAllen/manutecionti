import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getEmailAddress,
  getInboundMessageText,
  parseTicketReplyRecipient,
} from './inbound-email.js'

test('maps only unguessable ticket reply addresses on the configured domain', () => {
  const address = 'Ticket-42-0123456789abcdef0123456789abcdef@reply.example.org'
  assert.deepEqual(parseTicketReplyRecipient(address, 'reply.example.org'), {
    ticketId: '42',
    replyKey: '0123456789abcdef0123456789abcdef',
  })
  assert.equal(parseTicketReplyRecipient('ticket-42-0123456789abcdef0123456789abcdef@other.example.org', 'reply.example.org'), null)
  assert.equal(parseTicketReplyRecipient('ticket-42@reply.example.org', 'reply.example.org'), null)
})

test('extracts the sender address without trusting its display name', () => {
  assert.equal(getEmailAddress('Someone <User@Example.org>'), 'user@example.org')
  assert.equal(getEmailAddress('not-an-email'), '')
})

test('uses plain text first, falls back to readable HTML, and enforces the chat limit', () => {
  assert.equal(getInboundMessageText({ text: '  Hello\r\nthere  ' }, 100), 'Hello\nthere')
  assert.equal(getInboundMessageText({ html: '<p>Hello&nbsp;there</p>' }, 100), 'Hello there')
  assert.equal(getInboundMessageText({ text: 'Hello there' }, 5), 'Hello')
})
