import { Router } from 'express'
import db from '../db/database.js'
import authRequired from '../middleware/auth.js'

const router = Router()
const VALID_STATUSES = ['Aberto', 'Em andamento', 'Aguardando', 'Concluído']
const VALID_PRIORITIES = ['critica', 'alta', 'media', 'baixa']

router.get('/yesterday', authRequired, (req, res) => {
  const dateRow = db.prepare("SELECT date('now', '-1 day') AS date").get()
  const totalCreated = db
    .prepare("SELECT COUNT(*) AS count FROM tickets WHERE date(created_at) = date('now', '-1 day')")
    .get()
    .count
  const totalResolved = db
    .prepare("SELECT COUNT(*) AS count FROM tickets WHERE closed_at IS NOT NULL AND date(closed_at) = date('now', '-1 day')")
    .get()
    .count

  const byStatus = Object.fromEntries(VALID_STATUSES.map((status) => [status, 0]))
  const byPriority = Object.fromEntries(VALID_PRIORITIES.map((priority) => [priority, 0]))

  const statusRows = db.prepare(`
    SELECT status, COUNT(*) AS total
    FROM tickets
    WHERE date(created_at) = date('now', '-1 day')
    GROUP BY status
  `).all()

  const priorityRows = db.prepare(`
    SELECT priority, COUNT(*) AS total
    FROM tickets
    WHERE date(created_at) = date('now', '-1 day')
    GROUP BY priority
  `).all()

  for (const row of statusRows) {
    byStatus[row.status] = row.total
  }

  for (const row of priorityRows) {
    byPriority[row.priority] = row.total
  }

  return res.json({
    date: dateRow.date,
    total_created: totalCreated,
    total_resolved: totalResolved,
    by_status: byStatus,
    by_priority: byPriority
  })
})

export default router
