const BASE_URL = import.meta.env.VITE_API_URL || '/api'

async function request(path, options = {}) {
  const token = localStorage.getItem('token')
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  }

  if (token) {
    headers.Authorization = 'Bearer ' + token
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  })

  const raw = await response.text()
  let data = {}

  if (raw) {
    try {
      data = JSON.parse(raw)
    } catch {
      data = { error: raw }
    }
  }

  if (!response.ok) {
    if (response.status === 401) {
      localStorage.removeItem('token')
    }

    throw new Error(data.error || 'Não foi possível completar a requisição.')
  }

  return data
}

function buildQuery(filters = {}) {
  const params = new URLSearchParams()

  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, value)
    }
  })

  const query = params.toString()
  return query ? `?${query}` : ''
}

export const api = {
  auth: {
    login(email, password) {
      return request('/auth/login', {
        method: 'POST',
        body: { email, password }
      })
    },
    register(name, email, password) {
      return request('/auth/register', {
        method: 'POST',
        body: { name, email, password }
      })
    },
    me() {
      return request('/auth/me')
    }
  },
  tickets: {
    list(filters) {
      return request(`/tickets${buildQuery(filters)}`)
    },
    create(data) {
      return request('/tickets', {
        method: 'POST',
        body: data
      })
    },
    get(id) {
      return request(`/tickets/${id}`)
    },
    update(id, data) {
      return request(`/tickets/${id}`, {
        method: 'PUT',
        body: data
      })
    },
    delete(id) {
      return request(`/tickets/${id}`, {
        method: 'DELETE'
      })
    },
    my() {
      return request('/tickets/my')
    }
  },
  reports: {
    yesterday() {
      return request('/reports/yesterday')
    }
  }
}
