import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'chamados-secret-dev'
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h'

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
  return {
    id: user.id,
    nome: user.nome,
    email: user.email,
    telefone: user.telefone,
    foto_perfil: user.foto_perfil || null,
    data_cadastro: user.data_cadastro,
    ultimo_acesso: user.ultimo_acesso,
  }
}
