import db from '../db/database.js'
import { verifyToken } from '../services/auth.js'

function getTokenFromHeader(headerValue = '') {
  if (!headerValue) {
    return null
  }

  if (headerValue.startsWith('Bearer ')) {
    return headerValue.slice(7).trim()
  }

  return headerValue.trim()
}

export function authRequired(req, res, next) {
  try {
    const token = getTokenFromHeader(req.headers.authorization)

    if (!token) {
      return res.status(401).json({ error: 'Token não informado.' })
    }

    const payload = verifyToken(token)
    const user = db
      .prepare('SELECT id, name, email, role, created_at FROM users WHERE id = ?')
      .get(payload.id)

    if (!user) {
      return res.status(401).json({ error: 'Usuário do token não encontrado.' })
    }

    req.user = user
    return next()
  } catch {
    return res.status(401).json({ error: 'Token inválido ou expirado.' })
  }
}

export default authRequired
