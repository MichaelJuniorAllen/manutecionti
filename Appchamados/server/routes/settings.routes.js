import express from 'express'
import { requireAuth } from '../middleware/auth.js'
import { mutateDatabase, readDatabase } from '../services/database.js'
import {
  createResendDomain,
  getResendDomain,
  isResendConfigured,
  listResendDomains,
  removeResendDomain,
  updateResendDomain,
  verifyResendDomain,
} from '../services/resend.js'

const router = express.Router()

router.use(requireAuth)

function ensureResendReady(res) {
  if (!isResendConfigured()) {
    res.status(400).json({ message: 'RESEND_API_KEY nao configurada.' })
    return false
  }

  return true
}

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

router.get('/resend-domains', async (_, res) => {
  if (!ensureResendReady(res)) {
    return
  }

  try {
    const result = await listResendDomains()
    return res.json(result)
  } catch (error) {
    return res.status(400).json({ message: error.message || 'Nao foi possivel listar os dominios.' })
  }
})

router.post('/resend-domains', async (req, res) => {
  const name = String(req.body.name || '').trim().toLowerCase()

  if (!name) {
    return res.status(400).json({ message: 'Informe o dominio.' })
  }

  if (!ensureResendReady(res)) {
    return
  }

  try {
    const result = await createResendDomain(name)
    return res.status(201).json(result)
  } catch (error) {
    return res.status(400).json({ message: error.message || 'Nao foi possivel criar o dominio.' })
  }
})

router.get('/resend-domains/:id', async (req, res) => {
  if (!ensureResendReady(res)) {
    return
  }

  try {
    const result = await getResendDomain(req.params.id)
    return res.json(result)
  } catch (error) {
    return res.status(400).json({ message: error.message || 'Nao foi possivel recuperar o dominio.' })
  }
})

router.post('/resend-domains/:id/verify', async (req, res) => {
  if (!ensureResendReady(res)) {
    return
  }

  try {
    const result = await verifyResendDomain(req.params.id)
    return res.json(result)
  } catch (error) {
    return res.status(400).json({ message: error.message || 'Nao foi possivel verificar o dominio.' })
  }
})

router.put('/resend-domains/:id', async (req, res) => {
  if (!ensureResendReady(res)) {
    return
  }

  const payload = {
    id: req.params.id,
    ...(Object.prototype.hasOwnProperty.call(req.body, 'openTracking') ? { openTracking: Boolean(req.body.openTracking) } : {}),
    ...(Object.prototype.hasOwnProperty.call(req.body, 'clickTracking') ? { clickTracking: Boolean(req.body.clickTracking) } : {}),
  }

  try {
    const result = await updateResendDomain(payload)
    return res.json(result)
  } catch (error) {
    return res.status(400).json({ message: error.message || 'Nao foi possivel atualizar o dominio.' })
  }
})

router.delete('/resend-domains/:id', async (req, res) => {
  if (!ensureResendReady(res)) {
    return
  }

  try {
    const result = await removeResendDomain(req.params.id)
    return res.json(result)
  } catch (error) {
    return res.status(400).json({ message: error.message || 'Nao foi possivel remover o dominio.' })
  }
})

export default router
