import express from 'express'
import { requireAuth } from '../middleware/auth.js'
import { mutateDatabase, readDatabase } from '../services/database.js'

const router = express.Router()

router.use(requireAuth)

router.get('/me', async (req, res) => {
  const db = await readDatabase()
  const userSettings = db.configuracoes[req.auth.user.id] || {
    notifications: true,
    compactMode: false,
  }

  return res.json({ settings: userSettings })
})

router.put('/me', async (req, res) => {
  const notifications = Boolean(req.body.notifications)
  const compactMode = Boolean(req.body.compactMode)

  let updated
  await mutateDatabase(async (db) => {
    db.configuracoes[req.auth.user.id] = {
      notifications,
      compactMode,
    }
    updated = db.configuracoes[req.auth.user.id]
  })

  return res.json({ message: 'Configurações atualizadas.', settings: updated })
})

export default router
