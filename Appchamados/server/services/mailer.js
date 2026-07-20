import nodemailer from 'nodemailer'
import { Resend } from 'resend'

const smtpHost = process.env.SMTP_HOST
const smtpPort = Number(process.env.SMTP_PORT || 587)
const smtpUser = process.env.SMTP_USER
const smtpPass = process.env.SMTP_PASS
const smtpFrom = process.env.SMTP_FROM || smtpUser || 'no-reply@appchamados.local'
const resendApiKey = process.env.RESEND_API_KEY || ''
const resendFromAddress = String(process.env.RESEND_FROM_ADDRESS || '').trim()
const emailServiceApiKey = process.env.EMAIL_SERVICE_API_KEY || ''
const emailFromAddress = process.env.EMAIL_FROM_ADDRESS || smtpFrom

const smtpConfigured = Boolean(smtpHost && smtpPort && smtpUser && smtpPass)
const resendConfigured = Boolean(resendApiKey && resendFromAddress)
const apiEmailConfigured = Boolean(emailServiceApiKey && emailFromAddress)

const resendClient = resendConfigured ? new Resend(resendApiKey) : null

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
  return smtpConfigured || resendConfigured || apiEmailConfigured
}

export function getEmailProviderStatus() {
  if (resendConfigured) {
    return { configured: true, provider: 'resend' }
  }

  if (apiEmailConfigured) {
    return { configured: true, provider: 'sendgrid' }
  }

  if (smtpConfigured) {
    return { configured: true, provider: 'smtp' }
  }

  return { configured: false, provider: 'fallback' }
}

async function sendEmailViaSendGrid({ to, subject, text, html }) {
  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${emailServiceApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: emailFromAddress },
      subject,
      content: [
        { type: 'text/plain', value: text },
        { type: 'text/html', value: html },
      ],
    }),
  })

  if (!response.ok) {
    const details = await response.text().catch(() => '')
    throw new Error(`Nao foi possivel enviar o codigo por e-mail via API. ${details}`.trim())
  }
}

async function sendEmailViaResend({ to, subject, text, html }) {
  const payload = {
    from: resendFromAddress,
    to: [to],
    subject,
    html,
    text,
  }

  const { error } = await resendClient.emails.send(payload)

  if (error) {
    const rawMessage = String(error.message || '').toLowerCase()
    if (rawMessage.includes('resend.dev') || rawMessage.includes('testing emails') || rawMessage.includes('only send testing')) {
      throw new Error('Resend em modo de teste. Configure RESEND_FROM_ADDRESS com um remetente do seu dominio verificado para enviar para qualquer destinatario.')
    }

    throw new Error(`Nao foi possivel enviar o codigo por e-mail via Resend. ${error.message || ''}`.trim())
  }
}

async function sendVerificationEmail({ to, subject, text, html, fallbackLabel, code }) {
  if (!to || !code) {
    throw new Error('Dados insuficientes para enviar e-mail de confirmação.')
  }

  if (!resendConfigured && !apiEmailConfigured && !smtpConfigured) {
    console.log(`[SMTP-FALLBACK] ${fallbackLabel} para ${to}: ${code}`)
    return { mode: 'fallback' }
  }

  if (resendConfigured) {
    await sendEmailViaResend({ to, subject, text, html })
    return { mode: 'resend' }
  }

  if (apiEmailConfigured) {
    await sendEmailViaSendGrid({ to, subject, text, html })
    return { mode: 'sendgrid' }
  }

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
    throw new Error('Nao foi possivel enviar o codigo por e-mail. Verifique a configuracao SMTP/API.')
  }
}

export async function sendEmailChangeCode({ to, userName, code, expiresInMinutes }) {
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

  return sendVerificationEmail({
    to,
    subject,
    text,
    html,
    fallbackLabel: 'Codigo de confirmacao de alteracao de e-mail',
    code,
  })
}

export async function sendRegistrationVerificationCode({ to, userName, code, expiresInMinutes }) {
  const subject = 'Codigo de confirmacao de cadastro'
  const text = [
    `Ola, ${userName || 'usuario'}!`,
    '',
    'Recebemos seu cadastro no sistema de chamados.',
    `Seu codigo de confirmacao e: ${code}`,
    `Este codigo expira em ${expiresInMinutes} minutos.`,
    '',
    'Se voce nao solicitou este cadastro, ignore este e-mail.',
  ].join('\n')

  const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; line-height: 1.5; color: #20251f;">
      <h2 style="margin-bottom: 8px;">Confirmacao de cadastro</h2>
      <p>Ola, <strong>${userName || 'usuario'}</strong>.</p>
      <p>Recebemos seu cadastro no sistema de chamados.</p>
      <p style="font-size: 22px; letter-spacing: 2px; font-weight: 700; margin: 16px 0;">${code}</p>
      <p>Este codigo expira em ${expiresInMinutes} minutos.</p>
      <p>Se voce nao solicitou este cadastro, ignore este e-mail.</p>
    </div>
  `

  return sendVerificationEmail({
    to,
    subject,
    text,
    html,
    fallbackLabel: 'Codigo de confirmacao de cadastro',
    code,
  })
}

export async function sendPasswordChangeCode({ to, userName, code, expiresInMinutes }) {
  const subject = 'Codigo de confirmacao para troca de senha'
  const text = [
    `Ola, ${userName || 'usuario'}!`,
    '',
    'Recebemos uma solicitacao para trocar sua senha.',
    `Seu codigo de confirmacao e: ${code}`,
    `Este codigo expira em ${expiresInMinutes} minutos.`,
    '',
    'Se voce nao solicitou essa alteracao, ignore este e-mail.',
  ].join('\n')

  const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; line-height: 1.5; color: #20251f;">
      <h2 style="margin-bottom: 8px;">Confirmacao de troca de senha</h2>
      <p>Ola, <strong>${userName || 'usuario'}</strong>.</p>
      <p>Recebemos uma solicitacao para trocar sua senha.</p>
      <p style="font-size: 22px; letter-spacing: 2px; font-weight: 700; margin: 16px 0;">${code}</p>
      <p>Este codigo expira em ${expiresInMinutes} minutos.</p>
      <p>Se voce nao solicitou essa alteracao, ignore este e-mail.</p>
    </div>
  `

  return sendVerificationEmail({
    to,
    subject,
    text,
    html,
    fallbackLabel: 'Codigo de confirmacao para troca de senha',
    code,
  })
}
