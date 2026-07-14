import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'chamados-secret-dev'
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h'

function normalizeUserRole(value = '') {
  const role = String(value).trim().toLowerCase()

  if (role === 'ti') return 'TI'
  if (role === 'manutenção' || role === 'manutencao' || role === 'manutenção ti' || role === 'manutencao ti') {
    return 'Manutenção'
  }

  return 'TI'
}

export async function hashPassword(password) {
  const salt = await bcrypt.genSalt(10)
  return bcrypt.hash(password, salt)
}

export function comparePassword(password, hash) {
  return bcrypt.compare(password, hash)
}

export function createToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      name: user.nome,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN },
  )
}

export function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET)
}

export function sanitizeUser(user) {
  const rawName = String(user?.nome || '').trim().replace(/\s+/g, ' ')
  const rawSurname = String(user?.sobrenome || '').trim().replace(/\s+/g, ' ')
  const rawNameParts = rawName.split(' ').filter(Boolean)
  const normalizedName = rawNameParts[0] || ''
  const normalizedSurname = rawSurname || rawNameParts.slice(1).join(' ')

  return {
    id: user.id,
    nome: normalizedName,
    sobrenome: normalizedSurname,
    funcao: normalizeUserRole(user.funcao),
    email: user.email,
    email_reserva: user.email_reserva || null,
    email_verified: user.email_verified !== false,
    telefone: user.telefone,
    foto_perfil: user.foto_perfil || null,
    data_cadastro: user.data_cadastro,
    ultimo_acesso: user.ultimo_acesso,
  }
}

export { normalizeUserRole }
