import nodemailer from 'nodemailer'
import { Resend } from 'resend'

const smtpHost = process.env.SMTP_HOST
const smtpPort = Number(process.env.SMTP_PORT || 587)
const smtpUser = process.env.SMTP_USER
const smtpPass = process.env.SMTP_PASS
const supportEmail = String(process.env.SUPPORT_EMAIL || 'Suporte@upacentral.co.uk').trim()
const smtpFrom = String(process.env.SMTP_FROM || supportEmail || smtpUser || '').trim()
const resendApiKey = process.env.RESEND_API_KEY || ''
const emailServiceApiKey = process.env.EMAIL_SERVICE_API_KEY || ''
const emailFromAddress = String(process.env.EMAIL_FROM_ADDRESS || supportEmail || smtpFrom || '').trim()
const resendFromAddress = String(process.env.RESEND_FROM_ADDRESS || `Suporte <${supportEmail}>`).trim()
const emailFallbackEnabled = String(process.env.EMAIL_FALLBACK_ENABLED || '').trim().toLowerCase() === 'true'
const requestedEmailProvider = String(process.env.EMAIL_PROVIDER || 'auto').trim().toLowerCase()

const smtpConfigured = Boolean(smtpHost && smtpPort && smtpUser && smtpPass)
const resendConfigured = Boolean(resendApiKey && resendFromAddress)
const apiEmailConfigured = Boolean(emailServiceApiKey && emailFromAddress)
const emailProviderConfiguration = {
  smtp: smtpConfigured,
  resend: resendConfigured,
  sendgrid: apiEmailConfigured,
}
const emailProvider = requestedEmailProvider === 'auto'
  ? (resendConfigured ? 'resend' : apiEmailConfigured ? 'sendgrid' : smtpConfigured ? 'smtp' : 'fallback')
  : requestedEmailProvider
const emailProviderConfigured = Boolean(emailProviderConfiguration[emailProvider])

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
  return emailProviderConfigured
}

export function getSupportEmail() {
  return supportEmail
}

export function getEmailProviderStatus() {
  return { configured: emailProviderConfigured, provider: emailProvider }
}

export async function sendNotificationEmail({ to, subject, text, html, replyTo }) {
  if (!to || !subject) {
    throw new Error('Dados insuficientes para enviar a notificação por e-mail.')
  }

  if (!emailProviderConfigured) {
    throw new Error('Nenhum provedor de e-mail configurado. Configure SMTP, Resend ou SendGrid no ambiente do servidor.')
  }

  if (emailProvider === 'resend') {
    const { error } = await resendClient.emails.send({
      from: resendFromAddress,
      to: [to],
      subject,
      html,
      text,
      ...(replyTo ? { replyTo } : {}),
    })
    if (error) {
      throw new Error(`Não foi possível enviar a notificação por e-mail via Resend. ${error.message || ''}`.trim())
    }
    return { mode: 'resend' }
  }

  if (emailProvider === 'sendgrid') {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${emailServiceApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: emailFromAddress },
        ...(replyTo ? { reply_to: { email: replyTo } } : {}),
        subject,
        content: [
          { type: 'text/plain', value: text },
          { type: 'text/html', value: html },
        ],
      }),
    })
    if (!response.ok) {
      const details = await response.text().catch(() => '')
      throw new Error(`Não foi possível enviar a notificação por e-mail via API. ${details}`.trim())
    }
    return { mode: 'sendgrid' }
  }

  try {
    await transporter.sendMail({ from: smtpFrom, to, subject, text, html, ...(replyTo ? { replyTo } : {}) })
    return { mode: 'smtp' }
  } catch {
    throw new Error('Não foi possível enviar a notificação por e-mail. Verifique a configuração SMTP/API.')
  }
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

  if (!emailProviderConfigured && emailFallbackEnabled) {
    console.log(`[SMTP-FALLBACK] ${fallbackLabel} para ${to}: ${code}`)
    return { mode: 'fallback' }
  }

  if (!emailProviderConfigured) {
    throw new Error('Nenhum provedor de e-mail configurado. Configure SMTP, Resend ou SendGrid no ambiente do servidor.')
  }

  if (emailProvider === 'resend') {
    await sendEmailViaResend({ to, subject, text, html })
    return { mode: 'resend' }
  }

  if (emailProvider === 'sendgrid') {
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

export async function sendPhoneChangeEmailCode({ to, userName, code, expiresInMinutes }) {
  const subject = 'Codigo de confirmacao para troca de telefone'
  const text = [
    `Ola, ${userName || 'usuario'}!`,
    '',
    'Recebemos uma solicitacao para alterar o seu numero de telefone.',
    `Seu codigo de confirmacao e: ${code}`,
    `Este codigo expira em ${expiresInMinutes} minutos.`,
    '',
    'Se voce nao solicitou essa alteracao, ignore este e-mail.',
  ].join('\n')

  const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; line-height: 1.5; color: #20251f;">
      <h2 style="margin-bottom: 8px;">Confirmacao de troca de telefone</h2>
      <p>Ola, <strong>${userName || 'usuario'}</strong>.</p>
      <p>Recebemos uma solicitacao para alterar o seu numero de telefone.</p>
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
    fallbackLabel: 'Codigo de confirmacao para troca de telefone',
    code,
  })
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
