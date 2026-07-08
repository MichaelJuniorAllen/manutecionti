import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { api } from '../../services/api'

function AuthPage({ onNotify }) {
  const [tab, setTab] = useState('login')
  const [loading, setLoading] = useState(false)
  const [forgotLoading, setForgotLoading] = useState(false)
  const [loginForm, setLoginForm] = useState({ email: '', senha: '' })
  const [registerForm, setRegisterForm] = useState({
    nome: '',
    email: '',
    telefone: '',
    senha: '',
    confirmarSenha: '',
    foto: null,
  })

  const { login, register, isAuthenticated, loadingSession } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const nextPath = useMemo(() => {
    const params = new URLSearchParams(location.search)
    return params.get('next') || '/historico'
  }, [location.search])

  useEffect(() => {
    if (!loadingSession && isAuthenticated) {
      navigate(nextPath, { replace: true })
    }
  }, [isAuthenticated, loadingSession, navigate, nextPath])

  function updateLoginField(event) {
    const { name, value } = event.target
    setLoginForm((current) => ({ ...current, [name]: value }))
  }

  function updateRegisterField(event) {
    const { name, value, files } = event.target
    setRegisterForm((current) => ({
      ...current,
      [name]: name === 'foto' ? files?.[0] || null : value,
    }))
  }

  async function handleLogin(event) {
    event.preventDefault()
    setLoading(true)

    try {
      await login(loginForm.email, loginForm.senha)
      onNotify('success', 'Login realizado com sucesso.')
      navigate(nextPath, { replace: true })
    } catch (error) {
      onNotify('error', error.message)
    } finally {
      setLoading(false)
    }
  }

  function validateRegister() {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(registerForm.email)) {
      throw new Error('Informe um e-mail válido.')
    }
    if ((registerForm.senha || '').length < 8) {
      throw new Error('A senha precisa ter no mínimo 8 caracteres.')
    }
    if (registerForm.senha !== registerForm.confirmarSenha) {
      throw new Error('A confirmação de senha não confere.')
    }
  }

  async function handleRegister(event) {
    event.preventDefault()
    setLoading(true)

    try {
      validateRegister()
      await register(registerForm)
      onNotify('success', 'Conta criada com sucesso. Você já está logado.')
      navigate(nextPath, { replace: true })
    } catch (error) {
      onNotify('error', error.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleForgotPassword() {
    if (!loginForm.email) {
      onNotify('warning', 'Informe seu e-mail para recuperar a senha.')
      return
    }

    try {
      setForgotLoading(true)
      const result = await api.auth.forgotPassword(loginForm.email)
      onNotify('success', result.message)
    } catch (error) {
      onNotify('error', error.message)
    } finally {
      setForgotLoading(false)
    }
  }

  return (
    <section className="auth-page">
      <div className="auth-card panel">
        <div className="auth-tabs">
          <button type="button" className={tab === 'login' ? 'active' : ''} onClick={() => setTab('login')}>
            Entrar
          </button>
          <button type="button" className={tab === 'register' ? 'active' : ''} onClick={() => setTab('register')}>
            Registrar-se
          </button>
        </div>

        {tab === 'login' ? (
          <form className="auth-form" onSubmit={handleLogin}>
            <div className="field">
              <label htmlFor="loginEmail">E-mail</label>
              <input id="loginEmail" name="email" type="email" value={loginForm.email} onChange={updateLoginField} required />
            </div>
            <div className="field">
              <label htmlFor="loginSenha">Senha</label>
              <input id="loginSenha" name="senha" type="password" value={loginForm.senha} onChange={updateLoginField} required />
            </div>
            <button type="submit" disabled={loading}>{loading ? 'Entrando...' : 'Entrar'}</button>
            <button type="button" className="link-btn" onClick={handleForgotPassword} disabled={forgotLoading}>
              {forgotLoading ? 'Processando...' : 'Esqueci minha senha'}
            </button>
          </form>
        ) : (
          <form className="auth-form" onSubmit={handleRegister}>
            <div className="field">
              <label htmlFor="registerNome">Nome completo</label>
              <input id="registerNome" name="nome" value={registerForm.nome} onChange={updateRegisterField} required />
            </div>
            <div className="row">
              <div className="field">
                <label htmlFor="registerEmail">E-mail</label>
                <input id="registerEmail" name="email" type="email" value={registerForm.email} onChange={updateRegisterField} required />
              </div>
              <div className="field">
                <label htmlFor="registerTelefone">Telefone</label>
                <input id="registerTelefone" name="telefone" value={registerForm.telefone} onChange={updateRegisterField} required />
              </div>
            </div>
            <div className="row">
              <div className="field">
                <label htmlFor="registerSenha">Senha</label>
                <input id="registerSenha" name="senha" type="password" value={registerForm.senha} onChange={updateRegisterField} required />
              </div>
              <div className="field">
                <label htmlFor="registerConfirmarSenha">Confirmar senha</label>
                <input
                  id="registerConfirmarSenha"
                  name="confirmarSenha"
                  type="password"
                  value={registerForm.confirmarSenha}
                  onChange={updateRegisterField}
                  required
                />
              </div>
            </div>
            <div className="field">
              <label htmlFor="registerFoto">Selecionar Foto (JPG, PNG, WEBP)</label>
              <input id="registerFoto" name="foto" type="file" accept="image/jpeg,image/png,image/webp" onChange={updateRegisterField} />
            </div>
            <button type="submit" disabled={loading}>{loading ? 'Registrando...' : 'Criar conta'}</button>
          </form>
        )}
      </div>
    </section>
  )
}

export default AuthPage
