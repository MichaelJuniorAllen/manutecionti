import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { api, getStoredToken, setStoredToken } from '../services/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loadingSession, setLoadingSession] = useState(true)

  useEffect(() => {
    const token = getStoredToken()
    if (!token) {
      setLoadingSession(false)
      return
    }

    api.auth
      .session()
      .then((result) => {
        setUser(result.user)
      })
      .catch(() => {
        setStoredToken(null)
        setUser(null)
      })
      .finally(() => {
        setLoadingSession(false)
      })
  }, [])

  async function login(email, senha) {
    const result = await api.auth.login({ email, senha })
    setStoredToken(result.token)
    setUser(result.user)
    return result
  }

  async function register(values) {
    const formData = new FormData()
    formData.append('nome', values.nome)
    formData.append('email', values.email)
    formData.append('telefone', values.telefone)
    formData.append('senha', values.senha)
    formData.append('confirmarSenha', values.confirmarSenha)
    if (values.foto) {
      formData.append('foto', values.foto)
    }

    const result = await api.auth.register(formData)
    setStoredToken(result.token)
    setUser(result.user)
    return result
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
