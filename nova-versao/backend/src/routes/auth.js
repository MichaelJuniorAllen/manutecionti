import bcrypt from 'bcryptjs'
import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import db from '../db/database.js'
import authRequired from '../middleware/auth.js'
import { signToken } from '../services/auth.js'

const router = Router()

function sanitizeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    created_at: user.created_at
  }
}

function buildAuthResponse(user) {
  const safeUser = sanitizeUser(user)
  const token = signToken({
    id: safeUser.id,
    name: safeUser.name,
    email: safeUser.email,
    role: safeUser.role
  })

  return { token, user: safeUser }
}

router.post('/login', (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase()
  const password = String(req.body?.password || '')

  if (!email || !password) {
    return res.status(400).json({ error: 'Informe e-mail e senha.' })
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email)
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Credenciais inválidas.' })
  }

  return res.json(buildAuthResponse(user))
})

router.post('/register', (req, res) => {
  const name = String(req.body?.name || '').trim()
  const email = String(req.body?.email || '').trim().toLowerCase()
  const password = String(req.body?.password || '')

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Nome, e-mail e senha são obrigatórios.' })
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres.' })
  }

  const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email)
  if (existingUser) {
    return res.status(409).json({ error: 'Já existe um usuário com este e-mail.' })
  }

  const id = uuidv4()
  const passwordHash = bcrypt.hashSync(password, 10)

  db.prepare(`
    INSERT INTO users (id, name, email, password_hash, role)
    VALUES (?, ?, ?, ?, 'user')
  `).run(id, name, email, passwordHash)

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id)
  return res.status(201).json(buildAuthResponse(user))
})

router.get('/me', authRequired, (req, res) => {
  return res.json({ user: req.user })
})

export default router
