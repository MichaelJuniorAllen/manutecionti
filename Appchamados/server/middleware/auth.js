import { readDatabase } from '../services/database.js'
import { verifyToken } from '../services/auth.js'

async function resolveUserFromToken(token) {
  const payload = verifyToken(token)
  const db = await readDatabase()
  const user = db.usuarios.find((item) => item.id === payload.sub)
  if (!user) {
    const error = new Error('Usuário não encontrado para esta sessão.')
    error.code = 'AUTH_USER_NOT_FOUND'
    throw error
  }

  return { payload, user }
}

function isInvalidTokenError(error) {
  return error?.name === 'TokenExpiredError'
    || error?.name === 'JsonWebTokenError'
    || error?.name === 'NotBeforeError'
    || error?.code === 'AUTH_USER_NOT_FOUND'
}

export async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (!token) {
    return res.status(401).json({ code: 'AUTH_REQUIRED', message: 'Sessão inválida. Faça login novamente.' })
  }

  try {
    req.auth = await resolveUserFromToken(token)
    return next()
  } catch (error) {
    if (isInvalidTokenError(error)) {
      return res.status(401).json({ code: 'AUTH_TOKEN_INVALID', message: 'Token expirado ou inválido.' })
    }

    return res.status(503).json({
      code: 'AUTH_VALIDATION_UNAVAILABLE',
      message: 'Não foi possível validar sua sessão agora. Tente novamente em instantes.',
    })
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
  } catch (error) {
    if (!isInvalidTokenError(error)) {
      req.authError = error
    }
    req.auth = null
  }

  return next()
}
