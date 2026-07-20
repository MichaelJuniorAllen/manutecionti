import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../../services/api'

function normalizeEmail(value = '') {
  return String(value || '').trim().toLowerCase()
}

function PasswordResetPage({ onNotify }) {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const initialEmail = useMemo(() => normalizeEmail(searchParams.get('email') || ''), [searchParams])

  const [step, setStep] = useState('request')
  const [loading, setLoading] = useState(false)
  const [accountNeedsVerification, setAccountNeedsVerification] = useState(false)
  const [form, setForm] = useState({
    email: initialEmail,
    code: '',
    newPassword: '',
    confirmNewPassword: '',
  })

  useEffect(() => {
    setForm((current) => ({ ...current, email: initialEmail }))
  }, [initialEmail])

  function updateField(event) {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: name === 'email' ? normalizeEmail(value) : value }))
    if (name === 'email') {
      setAccountNeedsVerification(false)
    }
  }

  async function handleRequestReset(event) {
    event.preventDefault()

    const email = normalizeEmail(form.email)
    if (!email) {
      onNotify('warning', 'Informe o e-mail pessoal da conta.')
      return
    }

    try {
      setLoading(true)
      const result = await api.auth.requestPasswordReset(email)
      setStep('confirm')
      setAccountNeedsVerification(false)
      onNotify('success', result.message)
      if (result?.debugCode) {
        onNotify('warning', `Código gerado em modo local: ${result.debugCode}`)
      }
    } catch (error) {
      const errorMessage = String(error?.message || '')
      const normalizedErrorMessage = errorMessage.toLowerCase()
      const isUnverifiedAccount = normalizedErrorMessage.includes('não foi validada')
        || normalizedErrorMessage.includes('nao foi validada')
        || normalizedErrorMessage.includes('confirme o e-mail de cadastro')

      if (isUnverifiedAccount) {
        setAccountNeedsVerification(true)
        onNotify('warning', 'Esta conta ainda nao foi validada. Escolha uma opcao para finalizar ou refazer o cadastro.')
      } else {
        onNotify('error', error.message)
      }
    } finally {
      setLoading(false)
    }
  }

  function goToFinishRegistration() {
    const email = normalizeEmail(form.email)
    navigate(`/autenticacao?tab=register&email=${encodeURIComponent(email)}&openRegistrationVerification=1`)
  }

  function goToRegisterAgain() {
    const email = normalizeEmail(form.email)
    navigate(`/autenticacao?tab=register&email=${encodeURIComponent(email)}`)
  }

  async function handleConfirmReset(event) {
    event.preventDefault()

    const email = normalizeEmail(form.email)
    const code = String(form.code || '').trim()
    const newPassword = String(form.newPassword || '')
    const confirmNewPassword = String(form.confirmNewPassword || '')

    if (!email || !code || !newPassword || !confirmNewPassword) {
      onNotify('warning', 'Preencha todos os campos.')
      return
    }

    if (newPassword.length < 8) {
      onNotify('warning', 'A nova senha precisa ter no mínimo 8 caracteres.')
      return
    }

    if (newPassword !== confirmNewPassword) {
      onNotify('warning', 'A confirmação da nova senha não confere.')
      return
    }

    try {
      setLoading(true)
      const result = await api.auth.confirmPasswordReset({ email, code, newPassword })
      onNotify('success', result.message)
      navigate(`/autenticacao?email=${encodeURIComponent(email)}`, { replace: true })
    } catch (error) {
      onNotify('error', error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="auth-page">
      <div className="auth-card panel">
        <div className="auth-tabs">
          <button type="button" className="active">Recuperar senha</button>
          <button type="button" onClick={() => navigate('/autenticacao')}>
            Voltar ao login
          </button>
        </div>

        <form className="auth-form" onSubmit={step === 'request' ? handleRequestReset : handleConfirmReset}>
          <div className="field">
            <label htmlFor="resetEmail">E-mail pessoal</label>
            <input
              id="resetEmail"
              name="email"
              type="email"
              value={form.email}
              onChange={updateField}
              placeholder="Digite o e-mail cadastrado"
              required
              disabled={step === 'confirm'}
            />
          </div>

          {step === 'request' ? (
            <>
              <button type="submit" disabled={loading}>
                {loading ? 'Enviando código...' : 'Enviar código para o e-mail'}
              </button>
              <button type="button" className="secondary" onClick={() => navigate('/autenticacao')}>
                Cancelar
              </button>
              {accountNeedsVerification ? (
                <>
                  <p className="settings-inline-tip">
                    A conta ainda esta pendente de validacao do e-mail. Voce pode concluir o cadastro com codigo ou refazer o cadastro.
                  </p>
                  <button type="button" className="secondary" onClick={goToFinishRegistration}>
                    Finalizar cadastro
                  </button>
                  <button type="button" className="secondary" onClick={goToRegisterAgain}>
                    Refazer cadastro com este e-mail
                  </button>
                </>
              ) : null}
            </>
          ) : (
            <>
              <div className="field">
                <label htmlFor="resetCode">Código recebido por e-mail</label>
                <input
                  id="resetCode"
                  name="code"
                  inputMode="numeric"
                  value={form.code}
                  onChange={updateField}
                  placeholder="000000"
                  required
                />
              </div>
              <div className="row">
                <div className="field">
                  <label htmlFor="resetNewPassword">Nova senha</label>
                  <input
                    id="resetNewPassword"
                    name="newPassword"
                    type="password"
                    value={form.newPassword}
                    onChange={updateField}
                    placeholder="Mínimo 8 caracteres"
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="resetConfirmPassword">Confirmar nova senha</label>
                  <input
                    id="resetConfirmPassword"
                    name="confirmNewPassword"
                    type="password"
                    value={form.confirmNewPassword}
                    onChange={updateField}
                    required
                  />
                </div>
              </div>
              <button type="submit" disabled={loading}>
                {loading ? 'Salvando...' : 'Confirmar troca de senha'}
              </button>
              <button type="button" className="secondary" onClick={() => setStep('request')}>
                Voltar para o e-mail
              </button>
            </>
          )}
        </form>
      </div>
    </section>
  )
}

export default PasswordResetPage
