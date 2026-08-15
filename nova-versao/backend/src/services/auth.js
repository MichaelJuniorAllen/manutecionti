import jwt from 'jsonwebtoken'

const isProduction = process.env.NODE_ENV === 'production'
const SECRET = process.env.JWT_SECRET || (isProduction ? null : 'dev-secret')

if (!SECRET) {
  throw new Error('JWT_SECRET não está definido. Configure a variável de ambiente JWT_SECRET antes de iniciar o servidor.')
}

const EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h'

export function signToken(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: EXPIRES_IN })
}

export function verifyToken(token) {
  return jwt.verify(token, SECRET)
}
