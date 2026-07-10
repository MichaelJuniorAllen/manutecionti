import express from 'express'
import multer from 'multer'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { comparePassword, createToken, hashPassword, sanitizeUser } from '../services/auth.js'
import { mutateDatabase, nextNumericId, nowIso, readDatabase } from '../services/database.js'
import { requireAuth } from '../middleware/auth.js'

const router = express.Router()

const storage = multer.diskStorage({
  destination: path.resolve(process.cwd(), 'public', 'uploads', 'profiles'),
  filename: (_, file, callback) => {
    const extension = path.extname(file.originalname)
    callback(null, `${Date.now()}-${randomUUID()}${extension}`)
  },
})

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_, file, callback) => {
    const mime = file.mimetype.toLowerCase()
    const allowed = ['image/jpeg', 'image/png', 'image/webp']
    if (!allowed.includes(mime)) {
      callback(new Error('Formato inválido. Envie JPG, PNG ou WEBP.'))
      return
    }
    callback(null, true)
  },
})

function normalizeEmail(value = '') {
  return value.trim().toLowerCase()
}

function normalizePhone(value = '') {
  return value.replace(/\D/g, '')
}

function isValidEmail(value = '') {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

router.post('/register', upload.single('foto'), async (req, res) => {
  try {
    const nome = (req.body.nome || '').trim()
    const email = normalizeEmail(req.body.email)
    const telefone = normalizePhone(req.body.telefone)
    const senha = req.body.senha || ''
    const confirmarSenha = req.body.confirmarSenha || ''

    if (!nome || !email || !telefone || !senha || !confirmarSenha) {
      return res.status(400).json({ message: 'Preencha todos os campos obrigatórios.' })
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ message: 'Formato de e-mail inválido.' })
    }

    if (senha.length < 8) {
      return res.status(400).json({ message: 'A senha deve ter no mínimo 8 caracteres.' })
    }

    if (senha !== confirmarSenha) {
      return res.status(400).json({ message: 'A confirmação de senha não confere.' })
    }

    const db = await readDatabase()
    const emailInUse = db.usuarios.some((user) => normalizeEmail(user.email) === email)
    if (emailInUse) {
      return res.status(409).json({ message: 'Este e-mail já está cadastrado.' })
    }

    const phoneInUse = db.usuarios.some((user) => normalizePhone(user.telefone) === telefone)
    if (phoneInUse) {
      return res.status(409).json({ message: 'Este telefone já está cadastrado.' })
    }

    const senha_hash = await hashPassword(senha)
    const now = nowIso()
    const foto_perfil = req.file ? `/uploads/profiles/${req.file.filename}` : null

    let createdUser
    await mutateDatabase(async (mutableDb) => {
      createdUser = {
        id: nextNumericId(mutableDb.usuarios),
        nome,
        funcao: 'Manutenção TI',
        email,
        email_reserva: null,
        telefone,
        senha_hash,
        foto_perfil,
        data_cadastro: now,
        ultimo_acesso: now,
      }
      mutableDb.usuarios.push(createdUser)
    })

    const token = createToken(createdUser)

    return res.status(201).json({
      message: 'Cadastro realizado com sucesso.',
      token,
      user: sanitizeUser(createdUser),
    })
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Erro ao criar conta.' })
  }
})

router.post('/login', async (req, res) => {
  const email = normalizeEmail(req.body.email)
  const senha = req.body.senha || ''

  if (!email || !senha) {
    return res.status(400).json({ message: 'Informe e-mail e senha.' })
  }

  const db = await readDatabase()
  const user = db.usuarios.find((item) => normalizeEmail(item.email) === email)
  if (!user) {
    return res.status(401).json({ message: 'Credenciais inválidas.' })
  }

  const valid = await comparePassword(senha, user.senha_hash)
  if (!valid) {
    return res.status(401).json({ message: 'Credenciais inválidas.' })
  }

  let sanitized
  await mutateDatabase(async (mutableDb) => {
    const found = mutableDb.usuarios.find((item) => item.id === user.id)
    found.ultimo_acesso = nowIso()
    sanitized = sanitizeUser(found)
  })

  const token = createToken({ ...user, ultimo_acesso: sanitized.ultimo_acesso })

  return res.json({
    message: 'Login realizado com sucesso.',
    token,
    user: sanitized,
  })
})

router.post('/forgot-password', async (req, res) => {
  const email = normalizeEmail(req.body.email)
  if (!email) {
    return res.status(400).json({ message: 'Informe o e-mail.' })
  }

  return res.json({
    message: 'Se o e-mail existir, você receberá instruções para redefinir a senha.',
  })
})

router.get('/session', requireAuth, async (req, res) => {
  return res.json({ user: sanitizeUser(req.auth.user) })
})

export default router
