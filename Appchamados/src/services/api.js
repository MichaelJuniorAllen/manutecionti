const API_BASE = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:4000/api' : '/api')
const TOKEN_KEY = 'chamados_token'

function getApiBaseUrl() {
  if (API_BASE.startsWith('http://') || API_BASE.startsWith('https://')) {
    return API_BASE
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  if (!origin) {
    return API_BASE
  }

  return `${origin}${API_BASE.startsWith('/') ? API_BASE : `/${API_BASE}`}`
}

export function getStoredToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function setStoredToken(token) {
  if (!token) {
    localStorage.removeItem(TOKEN_KEY)
    return
  }
  localStorage.setItem(TOKEN_KEY, token)
}

async function request(path, options = {}) {
  const token = options.token ?? getStoredToken()
  const headers = new Headers(options.headers || {})

  if (!options.formData) {
    headers.set('Content-Type', 'application/json')
  }
  headers.set('Cache-Control', 'no-cache, no-store, must-revalidate')
  headers.set('Pragma', 'no-cache')
  headers.set('Expires', '0')

  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method || 'GET',
    headers,
    cache: 'no-store',
    body: options.formData ? options.body : options.body ? JSON.stringify(options.body) : undefined,
  })

  const raw = await response.text()
  let data = {}

  if (raw) {
    try {
      data = JSON.parse(raw)
    } catch {
      data = { rawMessage: raw }
    }
  }

  if (!response.ok) {
    const rawMessage = String(data.rawMessage || '').trim()
    const defaultMessage = rawMessage || `Erro ao processar requisição (HTTP ${response.status}).`
    let friendlyMessage = data.message || defaultMessage

    if (response.status === 404 && path === '/profile/request-phone-change') {
      friendlyMessage = 'Funcionalidade de SMS indisponível no servidor atual. Reinicie o backend para carregar as novas rotas.'
    }

    if (response.status === 401) {
      const message = String(data.message || '').toLowerCase()
      const isSessionError = message.includes('token expirado')
        || message.includes('sessão inválida')
        || message.includes('sessao invalida')
        || message.includes('token expirado ou inválido')

      if (isSessionError) {
        setStoredToken(null)
        friendlyMessage = 'Sua sessão expirou. Faça login novamente para continuar.'
      }
    }

    throw new Error(friendlyMessage)
  }

  return data
}

export const api = {
  auth: {
    register(formData) {
      return request('/auth/register', { method: 'POST', body: formData, formData: true, token: null })
    },
    confirmRegistrationEmail(payload) {
      return request('/auth/confirm-registration-email', { method: 'POST', body: payload, token: null })
    },
    resendRegistrationEmail(email) {
      return request('/auth/resend-registration-email', { method: 'POST', body: { email }, token: null })
    },
    login(payload) {
      return request('/auth/login', { method: 'POST', body: payload, token: null })
    },
    forgotPassword(email) {
      return request('/auth/forgot-password', { method: 'POST', body: { email }, token: null })
    },
    session() {
      return request('/auth/session')
    },
  },
  profile: {
    me() {
      return request('/profile/me')
    },
    update(formData) {
      return request('/profile/me', { method: 'PUT', body: formData, formData: true })
    },
    updateEmails(payload) {
      return request('/profile/emails', { method: 'PUT', body: payload })
    },
    requestEmailChange(newEmail) {
      return request('/profile/request-email-change', { method: 'POST', body: { newEmail } })
    },
    confirmEmailChange(code) {
      return request('/profile/confirm-email-change', { method: 'POST', body: { code } })
    },
    requestPhoneChange(newPhone) {
      return request('/profile/request-phone-change', { method: 'POST', body: { newPhone } })
    },
    smsStatus() {
      return request('/profile/sms-status')
    },
    confirmPhoneChange(code) {
      return request('/profile/confirm-phone-change', { method: 'POST', body: { code } })
    },
    requestPasswordChange(payload) {
      return request('/profile/request-password-change', { method: 'POST', body: payload })
    },
    confirmPasswordChange(code) {
      return request('/profile/confirm-password-change', { method: 'POST', body: { code } })
    },
    changePassword(payload) {
      return request('/profile/change-password', { method: 'POST', body: payload })
    },
  },
  tickets: {
    create(payload) {
      return request('/tickets', { method: 'POST', body: payload })
    },
    mine(filters = {}) {
      const query = new URLSearchParams()
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '' && value !== 'todos') {
          query.set(key, String(value))
        }
      })
      query.set('_ts', String(Date.now()))
      const suffix = query.toString() ? `?${query.toString()}` : ''
      return request(`/tickets/my${suffix}`)
    },
    updateStatus(id, payload) {
      return request(`/tickets/${id}/status`, { method: 'PATCH', body: payload })
    },
    dashboard() {
      return request('/tickets/dashboard/me')
    },
    actions() {
      return request('/tickets/history/actions')
    },
    streamUrl() {
      const token = getStoredToken()
      if (!token) {
        return null
      }

      const baseUrl = getApiBaseUrl()
      return `${baseUrl}/tickets/stream?token=${encodeURIComponent(token)}`
    },
  },
  settings: {
    me() {
      return request('/settings/me')
    },
    update(payload) {
      return request('/settings/me', { method: 'PUT', body: payload })
    },
  },
}
