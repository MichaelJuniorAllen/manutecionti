import express from 'express'
import multer from 'multer'
import { comparePassword, createToken, hashPassword, normalizeUserRole, sanitizeUser } from '../services/auth.js'
import { mutateDatabase, nextNumericId, nowIso, readDatabase } from '../services/database.js'
import { requireAuth } from '../middleware/auth.js'
import { sendRegistrationVerificationCode } from '../services/mailer.js'

const router = express.Router()

const upload = multer({
  storage: multer.memoryStorage(),
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

function normalizeName(value = '') {
  return String(value || '').trim().replace(/\s+/g, ' ')
}

function createProfilePhotoValue(file) {
  if (!file?.buffer?.length) {
    return null
  }

  return `data:${file.mimetype};base64,${file.buffer.toString('base64')}`
}

const CORPORATE_EMAIL_RULES = new Map([
  ['tiupacentral@maoamigacaxias.org.br', 'TI'],
  ['manutencaoupacentral@maoamigacaxias.org.br', 'Manutenção'],
])

const REGISTRATION_CODE_EXPIRES_MINUTES = 15

router.post('/register', upload.single('foto'), async (req, res) => {
  try {
    const nome = normalizeName(req.body.nome)
    const sobrenome = normalizeName(req.body.sobrenome)
    const email = normalizeEmail(req.body.email)
    const emailReserva = normalizeEmail(req.body.email_reserva)
    const telefone = normalizePhone(req.body.telefone)
    const senha = req.body.senha || ''
    const confirmarSenha = req.body.confirmarSenha || ''
    const funcao = normalizeUserRole(req.body.funcao || '')

    if (!nome || !sobrenome || !email || !emailReserva || !telefone || !senha || !confirmarSenha || !funcao) {
      return res.status(400).json({ message: 'Preencha todos os campos obrigatórios.' })
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ message: 'Formato de e-mail pessoal inválido.' })
    }

    if (!isValidEmail(emailReserva)) {
      return res.status(400).json({ message: 'Formato de e-mail corporativo inválido.' })
    }

    const normalizedCorporateEmail = emailReserva.toLowerCase()
    if (!CORPORATE_EMAIL_RULES.has(normalizedCorporateEmail)) {
      return res.status(400).json({ message: 'Selecione um e-mail corporativo autorizado.' })
    }

    const expectedRole = CORPORATE_EMAIL_RULES.get(normalizedCorporateEmail)
    if (funcao !== expectedRole) {
      return res.status(400).json({ message: 'A função deve corresponder ao e-mail corporativo selecionado.' })
    }

    if (email === emailReserva) {
      return res.status(400).json({ message: 'E-mail pessoal e corporativo devem ser diferentes.' })
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
      return res.status(409).json({ message: 'Este e-mail pessoal já está cadastrado.' })
    }

    const corporateEmailInUse = db.usuarios.some((user) => normalizeEmail(user.email_reserva) === emailReserva)
    if (corporateEmailInUse) {
      return res.status(409).json({ message: 'Este e-mail corporativo já está cadastrado.' })
    }

    const phoneInUse = db.usuarios.some((user) => normalizePhone(user.telefone) === telefone)
    if (phoneInUse) {
      return res.status(409).json({ message: 'Este telefone já está cadastrado.' })
    }

    const senha_hash = await hashPassword(senha)
    const now = nowIso()
    const foto_perfil = createProfilePhotoValue(req.file)

    let createdUser
    const verificationCode = String(Math.floor(100000 + Math.random() * 900000))
    const verificationExpiresAt = new Date(Date.now() + REGISTRATION_CODE_EXPIRES_MINUTES * 60000).toISOString()
    await mutateDatabase(async (mutableDb) => {
      createdUser = {
        id: nextNumericId(mutableDb.usuarios),
        nome: `${nome} ${sobrenome}`.trim(),
        sobrenome,
        funcao,
        email,
        email_reserva: emailReserva,
        telefone,
        senha_hash,
        foto_perfil,
        data_cadastro: now,
        ultimo_acesso: now,
        email_verified: false,
        pending_email_verification: {
          code: verificationCode,
          requested_at: now,
          expires_at: verificationExpiresAt,
        },
      }
      mutableDb.usuarios.push(createdUser)
    })

    const sendResult = await sendRegistrationVerificationCode({
      to: email,
      userName: nome,
      code: verificationCode,
      expiresInMinutes: REGISTRATION_CODE_EXPIRES_MINUTES,
    })

    return res.status(201).json({
      message: 'Cadastro realizado com sucesso. Verifique seu e-mail pessoal para validar a conta.',
      user: sanitizeUser(createdUser),
      verificationRequired: true,
      emailVerificationSent: true,
      ...(sendResult.mode === 'fallback' || process.env.NODE_ENV !== 'production' ? { debugCode: verificationCode } : {}),
    })
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Erro ao criar conta.' })
  }
})

router.post('/confirm-registration-email', async (req, res) => {
  const email = normalizeEmail(req.body.email)
  const code = String(req.body.code || '').trim()

  if (!email || !code) {
    return res.status(400).json({ message: 'Informe e-mail e código de confirmação.' })
  }

  try {
    let verifiedUser

    await mutateDatabase(async (db) => {
      const user = db.usuarios.find((item) => normalizeEmail(item.email) === email)

      if (!user) {
        throw new Error('Conta não encontrada para confirmação.')
      }

      if (user.email_verified === true) {
        verifiedUser = sanitizeUser(user)
        return
      }

      if (!user.pending_email_verification || user.pending_email_verification.code !== code) {
        throw new Error('Código inválido para confirmação de cadastro.')
      }

      const expiresAtMs = new Date(user.pending_email_verification.expires_at || 0).getTime()
      if (!Number.isFinite(expiresAtMs) || Date.now() > expiresAtMs) {
        delete user.pending_email_verification
        throw new Error('Código expirado. Solicite um novo cadastro ou refaça a confirmação.')
      }

      user.email_verified = true
      delete user.pending_email_verification
      user.ultimo_acesso = nowIso()
      verifiedUser = sanitizeUser(user)
    })

    const token = createToken(verifiedUser)

    return res.json({
      message: 'E-mail confirmado com sucesso. Conta ativada.',
      token,
      user: verifiedUser,
    })
  } catch (error) {
    return res.status(400).json({ message: error.message || 'Não foi possível confirmar o e-mail.' })
  }
})

router.post('/resend-registration-email', async (req, res) => {
  const email = normalizeEmail(req.body.email)

  if (!email) {
    return res.status(400).json({ message: 'Informe o e-mail pessoal.' })
  }

  try {
    let userName = ''
    let verificationCode = ''

    await mutateDatabase(async (db) => {
      const user = db.usuarios.find((item) => normalizeEmail(item.email) === email)

      if (!user) {
        throw new Error('Conta não encontrada para reenviar o código.')
      }

      if (user.email_verified === true) {
        throw new Error('Esta conta já foi validada.')
      }

      userName = user.nome
      verificationCode = String(Math.floor(100000 + Math.random() * 900000))
      user.pending_email_verification = {
        code: verificationCode,
        requested_at: nowIso(),
        expires_at: new Date(Date.now() + REGISTRATION_CODE_EXPIRES_MINUTES * 60000).toISOString(),
      }
    })

    const sendResult = await sendRegistrationVerificationCode({
      to: email,
      userName,
      code: verificationCode,
      expiresInMinutes: REGISTRATION_CODE_EXPIRES_MINUTES,
    })

    return res.json({
      message: 'Novo código enviado para o e-mail pessoal.',
      ...(sendResult.mode === 'fallback' || process.env.NODE_ENV !== 'production' ? { debugCode: verificationCode } : {}),
    })
  } catch (error) {
    return res.status(400).json({ message: error.message || 'Não foi possível reenviar o código.' })
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

  if (user.email_verified === false) {
    return res.status(403).json({ message: 'Sua conta ainda não foi validada. Verifique seu e-mail pessoal para confirmar o cadastro.' })
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
