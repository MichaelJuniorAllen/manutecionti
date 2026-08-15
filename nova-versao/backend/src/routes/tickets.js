import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import db from '../db/database.js'
import authRequired from '../middleware/auth.js'

const router = Router()
const VALID_STATUSES = ['Aberto', 'Em andamento', 'Aguardando', 'Concluído']
const VALID_PRIORITIES = ['critica', 'alta', 'media', 'baixa']

function currentTimestamp() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ')
}

function validateStatus(value) {
  return !value || VALID_STATUSES.includes(value)
}

function validatePriority(value) {
  return !value || VALID_PRIORITIES.includes(value)
}

function canManageTicket(ticket, user) {
  return user.role === 'admin' || ticket.created_by === user.id
}

router.get('/my', authRequired, (req, res) => {
  const tickets = db
    .prepare('SELECT * FROM tickets WHERE created_by = ? ORDER BY datetime(created_at) DESC')
    .all(req.user.id)

  return res.json({ tickets })
})

router.get('/', authRequired, (req, res) => {
  const { status, priority, search, userId } = req.query
  const clauses = []
  const params = []

  if (!validateStatus(status)) {
    return res.status(400).json({ error: 'Status inválido.' })
  }

  if (!validatePriority(priority)) {
    return res.status(400).json({ error: 'Prioridade inválida.' })
  }

  if (status) {
    clauses.push('status = ?')
    params.push(status)
  }

  if (priority) {
    clauses.push('priority = ?')
    params.push(priority)
  }

  if (userId) {
    clauses.push('created_by = ?')
    params.push(String(userId))
  }

  if (search) {
    clauses.push('(title LIKE ? OR description LIKE ? OR category LIKE ? OR created_by_name LIKE ?)')
    const term = `%${String(search).trim()}%`
    params.push(term, term, term, term)
  }

  const whereClause = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
  const query = `SELECT * FROM tickets ${whereClause} ORDER BY datetime(created_at) DESC`
  const tickets = db.prepare(query).all(...params)

  return res.json({ tickets })
})

router.post('/', authRequired, (req, res) => {
  const title = String(req.body?.title || '').trim()
  const description = String(req.body?.description || '').trim()
  const priority = String(req.body?.priority || 'media')
  const category = req.body?.category ? String(req.body.category).trim() : null

  if (!title || !description) {
    return res.status(400).json({ error: 'Título e descrição são obrigatórios.' })
  }

  if (!validatePriority(priority)) {
    return res.status(400).json({ error: 'Prioridade inválida.' })
  }

  const id = uuidv4()
  const createdAt = currentTimestamp()

  db.prepare(`
    INSERT INTO tickets (
      id,
      title,
      description,
      priority,
      status,
      category,
      created_by,
      created_by_name,
      created_at,
      updated_at,
      closed_at
    ) VALUES (?, ?, ?, ?, 'Aberto', ?, ?, ?, ?, ?, NULL)
  `).run(
    id,
    title,
    description,
    priority,
    category,
    req.user.id,
    req.user.name,
    createdAt,
    createdAt
  )

  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(id)
  return res.status(201).json({ ticket })
})

router.get('/:id', authRequired, (req, res) => {
  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(req.params.id)
  if (!ticket) {
    return res.status(404).json({ error: 'Chamado não encontrado.' })
  }

  return res.json({ ticket })
})

router.put('/:id', authRequired, (req, res) => {
  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(req.params.id)
  if (!ticket) {
    return res.status(404).json({ error: 'Chamado não encontrado.' })
  }

  if (!canManageTicket(ticket, req.user)) {
    return res.status(403).json({ error: 'Você não tem permissão para editar este chamado.' })
  }

  const nextTitle = req.body?.title !== undefined ? String(req.body.title).trim() : ticket.title
  const nextDescription = req.body?.description !== undefined ? String(req.body.description).trim() : ticket.description
  const nextPriority = req.body?.priority !== undefined ? String(req.body.priority) : ticket.priority
  const nextStatus = req.body?.status !== undefined ? String(req.body.status) : ticket.status
  const nextCategory = req.body?.category !== undefined
    ? (String(req.body.category).trim() || null)
    : ticket.category

  if (!nextTitle || !nextDescription) {
    return res.status(400).json({ error: 'Título e descrição são obrigatórios.' })
  }

  if (!validatePriority(nextPriority)) {
    return res.status(400).json({ error: 'Prioridade inválida.' })
  }

  if (!validateStatus(nextStatus)) {
    return res.status(400).json({ error: 'Status inválido.' })
  }

  const updatedAt = currentTimestamp()
  const closedAt = nextStatus === 'Concluído'
    ? (ticket.closed_at || updatedAt)
    : null

  db.prepare(`
    UPDATE tickets
    SET title = ?,
        description = ?,
        priority = ?,
        status = ?,
        category = ?,
        updated_at = ?,
        closed_at = ?
    WHERE id = ?
  `).run(
    nextTitle,
    nextDescription,
    nextPriority,
    nextStatus,
    nextCategory,
    updatedAt,
    closedAt,
    ticket.id
  )

  const updatedTicket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(ticket.id)
  return res.json({ ticket: updatedTicket })
})

router.delete('/:id', authRequired, (req, res) => {
  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(req.params.id)
  if (!ticket) {
    return res.status(404).json({ error: 'Chamado não encontrado.' })
  }

  if (!canManageTicket(ticket, req.user)) {
    return res.status(403).json({ error: 'Você não tem permissão para remover este chamado.' })
  }

  db.prepare('DELETE FROM tickets WHERE id = ?').run(ticket.id)
  return res.json({ message: 'Chamado removido com sucesso.' })
})

export default router
