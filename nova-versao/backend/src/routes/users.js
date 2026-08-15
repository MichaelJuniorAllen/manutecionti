import { Router } from 'express'
import db from '../db/database.js'
import authRequired from '../middleware/auth.js'

const router = Router()

router.get('/', authRequired, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Apenas administradores podem listar usuários.' })
  }

  const users = db
    .prepare('SELECT id, name, email, role, created_at FROM users ORDER BY name ASC')
    .all()

  return res.json({ users })
})

router.get('/:id', authRequired, (req, res) => {
  if (req.user.role !== 'admin' && req.user.id !== req.params.id) {
    return res.status(403).json({ error: 'Você não tem permissão para visualizar este usuário.' })
  }

  const user = db
    .prepare('SELECT id, name, email, role, created_at FROM users WHERE id = ?')
    .get(req.params.id)

  if (!user) {
    return res.status(404).json({ error: 'Usuário não encontrado.' })
  }

  return res.json({ user })
})

export default router
