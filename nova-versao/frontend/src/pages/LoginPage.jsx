import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../services/api'
import { showToast } from '../components/Toast'

export default function LoginPage() {
  const navigate = useNavigate()
  const { user, login } = useAuth()
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (user) {
      navigate('/dashboard', { replace: true })
    }
  }, [navigate, user])

  function updateField(event) {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setSubmitting(true)
    setError('')

    try {
      const response = mode === 'login'
        ? await api.auth.login(form.email, form.password)
        : await api.auth.register(form.name, form.email, form.password)

      login(response.token, response.user)
      showToast(mode === 'login' ? 'Login realizado com sucesso.' : 'Conta criada com sucesso.', 'success')
      navigate('/dashboard', { replace: true })
    } catch (submitError) {
      setError(submitError.message)
      showToast(submitError.message, 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="auth-page">
      <section className="auth-hero">
        <span className="hero-chip">Nova versão do helpdesk</span>
        <h1>Atendimento profissional com foco em produtividade.</h1>
        <p>
          Organize solicitações, acompanhe prioridades e visualize indicadores diários
          em uma interface moderna e objetiva.
        </p>
        <div className="hero-highlights">
          <div className="highlight-card">
            <strong>Tickets centralizados</strong>
            <span>Fluxo completo de abertura, acompanhamento e encerramento.</span>
          </div>
          <div className="highlight-card">
            <strong>Indicadores rápidos</strong>
            <span>Dashboard com visão de volume, prioridades e andamento.</span>
          </div>
        </div>
      </section>

      <section className="auth-card">
        <div className="auth-tabs">
          <button
            type="button"
            className={`tab-button ${mode === 'login' ? 'tab-button-active' : ''}`}
            onClick={() => setMode('login')}
          >
            Entrar
          </button>
          <button
            type="button"
            className={`tab-button ${mode === 'register' ? 'tab-button-active' : ''}`}
            onClick={() => setMode('register')}
          >
            Criar conta
          </button>
        </div>

        <form className="form-card auth-form" onSubmit={handleSubmit}>
          <div>
            <h2>{mode === 'login' ? 'Acesse sua conta' : 'Cadastre um novo usuário'}</h2>
            <p>Use suas credenciais para entrar no sistema de chamados.</p>
          </div>

          {mode === 'register' ? (
            <label className="field">
              <span>Nome completo</span>
              <input
                name="name"
                value={form.name}
                onChange={updateField}
                placeholder="Ex.: Maria Fernandes"
                required
              />
            </label>
          ) : null}

          <label className="field">
            <span>E-mail</span>
            <input
              type="email"
              name="email"
              value={form.email}
              onChange={updateField}
              placeholder="voce@empresa.com"
              required
            />
          </label>

          <label className="field">
            <span>Senha</span>
            <input
              type="password"
              name="password"
              value={form.password}
              onChange={updateField}
              placeholder="••••••••"
              required
            />
          </label>

          {error ? <div className="alert alert-error">{error}</div> : null}

          <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
            {submitting ? 'Processando...' : mode === 'login' ? 'Entrar no painel' : 'Criar conta'}
          </button>

          {import.meta.env.DEV && (
            <div className="auth-hint">
              <span>Dica para testes:</span>
              <code>admin@example.com / admin123</code>
            </div>
          )}
        </form>
      </section>
    </div>
  )
}
