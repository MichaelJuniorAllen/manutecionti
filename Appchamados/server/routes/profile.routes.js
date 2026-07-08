import express from 'express'
import multer from 'multer'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { requireAuth } from '../middleware/auth.js'
import { comparePassword, hashPassword, sanitizeUser } from '../services/auth.js'
import { mutateDatabase, nowIso } from '../services/database.js'
import { isSmtpConfigured, sendEmailChangeCode } from '../services/mailer.js'

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

router.get('/me', requireAuth, async (req, res) => {
  return res.json({ user: sanitizeUser(req.auth.user) })
})

router.put('/me', requireAuth, upload.single('foto'), async (req, res) => {
  const nome = (req.body.nome || '').trim()
  const telefone = normalizePhone(req.body.telefone)
  const senha = req.body.senha || ''

  if (!nome || !telefone) {
    return res.status(400).json({ message: 'Nome e telefone são obrigatórios.' })
  }

  let resultUser

  try {
    await mutateDatabase(async (db) => {
      const user = db.usuarios.find((item) => item.id === req.auth.user.id)
      const phoneInUse = db.usuarios.some((item) => item.id !== user.id && normalizePhone(item.telefone) === telefone)

      if (phoneInUse) {
        throw new Error('Telefone já utilizado por outro usuário.')
      }

      user.nome = nome
      user.telefone = telefone
      if (req.file) {
        user.foto_perfil = `/uploads/profiles/${req.file.filename}`
      }

      if (senha) {
        if (senha.length < 8) {
          throw new Error('A nova senha deve ter no mínimo 8 caracteres.')
        }
        user.senha_hash = await hashPassword(senha)
      }

      resultUser = sanitizeUser(user)
    })

    return res.json({ message: 'Perfil atualizado com sucesso.', user: resultUser })
  } catch (error) {
    return res.status(400).json({ message: error.message || 'Erro ao atualizar perfil.' })
  }
})

router.post('/request-email-change', requireAuth, async (req, res) => {
  const newEmail = normalizeEmail(req.body.newEmail)
  const expirationMinutes = 15

  if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
    return res.status(400).json({ message: 'Informe um e-mail válido.' })
  }

  try {
    let userName = ''
    let code = ''

    await mutateDatabase(async (db) => {
      const user = db.usuarios.find((item) => item.id === req.auth.user.id)
      const emailInUse = db.usuarios.some((item) => item.id !== user.id && normalizeEmail(item.email) === newEmail)
      if (emailInUse) {
        throw new Error('E-mail já em uso por outro usuário.')
      }

      userName = user.nome
      code = String(Math.floor(100000 + Math.random() * 900000))
      const expiresAt = new Date(Date.now() + expirationMinutes * 60000).toISOString()
      user.pending_email_change = {
        new_email: newEmail,
        code,
        requested_at: nowIso(),
        expires_at: expiresAt,
      }
    })

    const sendResult = await sendEmailChangeCode({
      to: newEmail,
      userName,
      code,
      expiresInMinutes: expirationMinutes,
    })

    const smtpMessage = sendResult.mode === 'smtp'
      ? 'Código enviado para o novo e-mail.'
      : 'SMTP não configurado. Código gerado em modo local (fallback no servidor).'

    return res.json({
      message: `Código de confirmação gerado. ${smtpMessage}`,
      smtpConfigured: isSmtpConfigured(),
    })
  } catch (error) {
    return res.status(400).json({ message: error.message || 'Não foi possível solicitar alteração.' })
  }
})

router.post('/confirm-email-change', requireAuth, async (req, res) => {
  const code = String(req.body.code || '').trim()

  if (!code) {
    return res.status(400).json({ message: 'Informe o código de confirmação.' })
  }

  try {
    let updated
    await mutateDatabase(async (db) => {
      const user = db.usuarios.find((item) => item.id === req.auth.user.id)
      if (!user.pending_email_change || user.pending_email_change.code !== code) {
        throw new Error('Código inválido para alteração de e-mail.')
      }

      const expiresAtMs = new Date(user.pending_email_change.expires_at || 0).getTime()
      if (!Number.isFinite(expiresAtMs) || Date.now() > expiresAtMs) {
        delete user.pending_email_change
        throw new Error('Código expirado. Solicite um novo código de confirmação.')
      }

      user.email = user.pending_email_change.new_email
      delete user.pending_email_change
      updated = sanitizeUser(user)
    })

    return res.json({ message: 'E-mail alterado com sucesso.', user: updated })
  } catch (error) {
    return res.status(400).json({ message: error.message || 'Não foi possível confirmar alteração.' })
  }
})

router.post('/change-password', requireAuth, async (req, res) => {
  const currentPassword = req.body.currentPassword || ''
  const newPassword = req.body.newPassword || ''

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ message: 'Informe a senha atual e a nova senha.' })
  }

  if (newPassword.length < 8) {
    return res.status(400).json({ message: 'A nova senha deve ter no mínimo 8 caracteres.' })
  }

  try {
    await mutateDatabase(async (db) => {
      const user = db.usuarios.find((item) => item.id === req.auth.user.id)
      const matches = await comparePassword(currentPassword, user.senha_hash)
      if (!matches) {
        throw new Error('Senha atual incorreta.')
      }
      user.senha_hash = await hashPassword(newPassword)
    })

    return res.json({ message: 'Senha alterada com sucesso.' })
  } catch (error) {
    return res.status(400).json({ message: error.message || 'Não foi possível alterar a senha.' })
  }
})

export default router
