import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { api, getStoredToken, setStoredToken } from '../services/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loadingSession, setLoadingSession] = useState(true)

  async function syncUserFromProfile(fallbackUser = null) {
    try {
      const profileResult = await api.profile.me()
      setUser(profileResult.user)
      return profileResult.user
    } catch {
      if (fallbackUser) {
        setUser(fallbackUser)
        return fallbackUser
      }
      throw new Error('Não foi possível sincronizar o perfil.')
    }
  }

  useEffect(() => {
    const token = getStoredToken()
    if (!token) {
      setLoadingSession(false)
      return
    }

    async function initSession() {
      const MAX_RETRIES = 3
      const RETRY_DELAY_MS = 3000

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          await syncUserFromProfile()
          return
        } catch (error) {
          const message = String(error?.message || '').toLowerCase()
          const errorCode = String(error?.code || '').trim()
          // Erro real de autenticação (token inválido/expirado) → deslogar
          const isAuthError = errorCode === 'AUTH_REQUIRED'
            || errorCode === 'AUTH_TOKEN_INVALID'
            || (Number(error?.status) === 401 && (
              message.includes('sessão') || message.includes('token')
              || message.includes('expirado') || message.includes('inválid') || message.includes('invalido')
            ))

          if (isAuthError) {
            setStoredToken(null)
            setUser(null)
            return
          }

          // Erro de rede (servidor reiniciando) → tenta novamente antes de deslogar
          if (attempt < MAX_RETRIES) {
            await new Promise((resolve) => window.setTimeout(resolve, RETRY_DELAY_MS))
          }
          // Após todas as tentativas, mantém o token para que na próxima
          // recarga da página a sessão seja restaurada automaticamente
        }
      }
    }

    initSession().finally(() => setLoadingSession(false))
  }, [])

  async function login(email, senha) {
    const result = await api.auth.login({ email, senha })
    setStoredToken(result.token)
    await syncUserFromProfile(result.user)
    return result
  }

  async function register(values) {
    const formData = new FormData()
    formData.append('nome', values.nome)
    formData.append('sobrenome', values.sobrenome)
    formData.append('funcao', values.funcao)
    formData.append('email', values.email)
    formData.append('email_reserva', values.emailCorporativo)
    formData.append('telefone', values.telefone)
    formData.append('senha', values.senha)
    formData.append('confirmarSenha', values.confirmarSenha)
    if (values.foto) {
      formData.append('foto', values.foto)
    }

    const result = await api.auth.register(formData)
    return result
  }

  async function confirmRegistrationEmail(email, code) {
    const result = await api.auth.confirmRegistrationEmail({ email, code })
    setStoredToken(result.token)
    await syncUserFromProfile(result.user)
    return result
  }

  async function resendRegistrationEmail(email) {
    return api.auth.resendRegistrationEmail(email)
  }

  function logout() {
    setStoredToken(null)
    setUser(null)
  }

  async function refreshUser() {
    const result = await api.profile.me()
    setUser(result.user)
    return result.user
  }

  const value = useMemo(
    () => ({
      user,
      loadingSession,
      isAuthenticated: Boolean(user),
      login,
      register,
      confirmRegistrationEmail,
      resendRegistrationEmail,
      logout,
      refreshUser,
      setUser,
    }),
    [loadingSession, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth deve ser usado dentro de AuthProvider.')
  }
  return context
}
