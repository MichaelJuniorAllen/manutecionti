import nodemailer from 'nodemailer'

const smtpHost = process.env.SMTP_HOST
const smtpPort = Number(process.env.SMTP_PORT || 587)
const smtpUser = process.env.SMTP_USER
const smtpPass = process.env.SMTP_PASS
const smtpFrom = process.env.SMTP_FROM || smtpUser || 'no-reply@appchamados.local'

const smtpConfigured = Boolean(smtpHost && smtpPort && smtpUser && smtpPass)

const transporter = smtpConfigured
  ? nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    })
  : null

export function isSmtpConfigured() {
  return smtpConfigured
}

export async function sendEmailChangeCode({ to, userName, code, expiresInMinutes }) {
  if (!to || !code) {
    throw new Error('Dados insuficientes para enviar e-mail de confirmação.')
  }

  if (!smtpConfigured) {
    console.log(`[SMTP-FALLBACK] Codigo de confirmacao para ${to}: ${code}`)
    return { mode: 'fallback' }
  }

  const subject = 'Codigo de confirmacao de alteracao de e-mail'
  const text = [
    `Ola, ${userName || 'usuario'}!`,
    '',
    'Recebemos uma solicitacao para alterar o seu e-mail.',
    `Seu codigo de confirmacao e: ${code}`,
    `Este codigo expira em ${expiresInMinutes} minutos.`,
    '',
    'Se voce nao solicitou essa alteracao, ignore este e-mail.',
  ].join('\n')

  const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; line-height: 1.5; color: #20251f;">
      <h2 style="margin-bottom: 8px;">Confirmacao de alteracao de e-mail</h2>
      <p>Ola, <strong>${userName || 'usuario'}</strong>.</p>
      <p>Recebemos uma solicitacao para alterar o seu e-mail.</p>
      <p style="font-size: 22px; letter-spacing: 2px; font-weight: 700; margin: 16px 0;">${code}</p>
      <p>Este codigo expira em ${expiresInMinutes} minutos.</p>
      <p>Se voce nao solicitou essa alteracao, ignore este e-mail.</p>
    </div>
  `

  try {
    await transporter.sendMail({
      from: smtpFrom,
      to,
      subject,
      text,
      html,
    })

    return { mode: 'smtp' }
  } catch {
    throw new Error('Nao foi possivel enviar o codigo por e-mail. Verifique a configuracao SMTP.')
  }
}
