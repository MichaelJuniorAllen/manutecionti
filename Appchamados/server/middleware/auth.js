import { readDatabase } from '../services/database.js'
import { verifyToken } from '../services/auth.js'

async function resolveUserFromToken(token) {
  const payload = verifyToken(token)
  const db = await readDatabase()
  const user = db.usuarios.find((item) => item.id === payload.sub)
  if (!user) {
    throw new Error('Usuário não encontrado para esta sessão.')
  }

  return { payload, user }
}

export async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (!token) {
    return res.status(401).json({ message: 'Sessão inválida. Faça login novamente.' })
  }

  try {
    req.auth = await resolveUserFromToken(token)
    return next()
  } catch {
    return res.status(401).json({ message: 'Token expirado ou inválido.' })
  }
}

export async function optionalAuth(req, _, next) {
  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (!token) {
    req.auth = null
    return next()
  }

  try {
    req.auth = await resolveUserFromToken(token)
  } catch {
    req.auth = null
  }

  return next()
}
