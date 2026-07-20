import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { api } from '../../services/api'

const ROLE_OPTIONS = ['TI', 'Manutenção']
const CORPORATE_EMAIL_OPTIONS = [
  { label: 'TIUpaCentral@maoamigacaxias.org.br', value: 'tiupacentral@maoamigacaxias.org.br', funcao: 'TI' },
  { label: 'ManutencaoUpaCentral@maoamigacaxias.org.br', value: 'manutencaoupacentral@maoamigacaxias.org.br', funcao: 'Manutenção' },
]

function AuthPage({ onNotify }) {
  const [tab, setTab] = useState('login')
  const [loading, setLoading] = useState(false)
  const [forgotLoading, setForgotLoading] = useState(false)
  const [loginForm, setLoginForm] = useState({ email: '', senha: '' })
  const [registerForm, setRegisterForm] = useState({
    nome: '',
    sobrenome: '',
    funcao: 'TI',
    email: '',
    emailCorporativo: '',
    telefone: '',
    senha: '',
    confirmarSenha: '',
    foto: null,
  })
  const [registerFotoPreviewUrl, setRegisterFotoPreviewUrl] = useState('')
  const [isRegistrationCodeModalOpen, setIsRegistrationCodeModalOpen] = useState(false)
  const [registrationVerificationCode, setRegistrationVerificationCode] = useState('')
  const [registrationEmailTarget, setRegistrationEmailTarget] = useState('')
  const [resendLoading, setResendLoading] = useState(false)
  const registerFotoInputRef = useRef(null)

  const { login, register, confirmRegistrationEmail, resendRegistrationEmail, isAuthenticated, loadingSession } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const nextPath = useMemo(() => {
    const params = new URLSearchParams(location.search)
    return params.get('next') || '/chamados'
  }, [location.search])

  useEffect(() => {
    if (!loadingSession && isAuthenticated) {
      navigate(nextPath, { replace: true })
    }
  }, [isAuthenticated, loadingSession, navigate, nextPath])

  useEffect(() => () => {
    if (registerFotoPreviewUrl) {
      URL.revokeObjectURL(registerFotoPreviewUrl)
    }
  }, [registerFotoPreviewUrl])

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const email = params.get('email')
    if (email && !loginForm.email) {
      setLoginForm((current) => ({ ...current, email }))
    }
  }, [location.search, loginForm.email])

  function updateLoginField(event) {
    const { name, value } = event.target
    setLoginForm((current) => ({ ...current, [name]: value }))
  }

  function updateRegisterField(event) {
    const { name, value, files } = event.target
    const file = name === 'foto' ? files?.[0] || null : null

    if (name === 'foto') {
      setRegisterForm((current) => ({
        ...current,
        foto: file,
      }))

      if (registerFotoPreviewUrl) {
        URL.revokeObjectURL(registerFotoPreviewUrl)
      }
      setRegisterFotoPreviewUrl(file ? URL.createObjectURL(file) : '')
      return
    }

    if (name === 'emailCorporativo') {
      const typedCorporateEmail = value
      const selectedOption = CORPORATE_EMAIL_OPTIONS.find((option) => option.value === typedCorporateEmail.trim().toLowerCase())

      setRegisterForm((current) => ({
        ...current,
        emailCorporativo: typedCorporateEmail,
        funcao: selectedOption?.funcao || current.funcao,
      }))
      return
    }

    setRegisterForm((current) => ({
      ...current,
      [name]: value,
    }))
  }

  function clearRegisterPhoto() {
    setRegisterForm((current) => ({ ...current, foto: null }))
    if (registerFotoPreviewUrl) {
      URL.revokeObjectURL(registerFotoPreviewUrl)
    }
    setRegisterFotoPreviewUrl('')
    if (registerFotoInputRef.current) {
      registerFotoInputRef.current.value = ''
    }
  }

  function closeRegistrationCodeModal() {
    setIsRegistrationCodeModalOpen(false)
    setRegistrationVerificationCode('')
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
    if (!registerForm.nome.trim()) {
      throw new Error('Informe o nome.')
    }
    if (!registerForm.sobrenome.trim()) {
      throw new Error('Informe o sobrenome.')
    }
    if (!registerForm.funcao) {
      throw new Error('Selecione a função.')
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(registerForm.email)) {
      throw new Error('Informe um e-mail pessoal válido.')
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(registerForm.emailCorporativo)) {
      throw new Error('Informe um e-mail corporativo válido.')
    }
    if (!CORPORATE_EMAIL_OPTIONS.some((option) => option.value === registerForm.emailCorporativo.trim().toLowerCase())) {
      throw new Error('Digite um e-mail corporativo autorizado.')
    }
    if (registerForm.email.trim().toLowerCase() === registerForm.emailCorporativo.trim().toLowerCase()) {
      throw new Error('Os e-mails pessoal e corporativo precisam ser diferentes.')
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
      const result = await register(registerForm)
      setRegistrationEmailTarget(registerForm.email.trim().toLowerCase())
      setRegistrationVerificationCode('')
      setIsRegistrationCodeModalOpen(true)

      if (result?.debugCode) {
        onNotify('warning', `Ambiente local sem serviço de e-mail: use o código ${result.debugCode} para confirmar.`)
      } else {
        onNotify('success', 'Cadastro criado. Verifique seu e-mail pessoal para confirmar a conta.')
      }
    } catch (error) {
      onNotify('error', error.message)
    } finally {
      setLoading(false)
    }
  }

  async function confirmRegistrationCode(event) {
    event.preventDefault()

    const code = String(registrationVerificationCode || '').trim()
    if (!code) {
      onNotify('warning', 'Informe o código enviado para seu e-mail pessoal.')
      return
    }

    try {
      const result = await confirmRegistrationEmail(registrationEmailTarget || registerForm.email, code)
      closeRegistrationCodeModal()
      onNotify('success', result.message)
      navigate(nextPath, { replace: true })
    } catch (error) {
      onNotify('error', error.message)
    }
  }

  async function resendRegistrationCode() {
    const targetEmail = registrationEmailTarget || registerForm.email.trim().toLowerCase()
    if (!targetEmail) {
      onNotify('warning', 'Informe o e-mail pessoal do cadastro.')
      return
    }

    try {
      setResendLoading(true)
      const result = await resendRegistrationEmail(targetEmail)
      setRegistrationVerificationCode('')
      if (result?.debugCode) {
        onNotify('warning', `Novo código gerado em modo local: ${result.debugCode}`)
      } else {
        onNotify('success', 'Novo código enviado para o seu e-mail pessoal.')
      }
    } catch (error) {
      onNotify('error', error.message)
    } finally {
      setResendLoading(false)
    }
  }

  async function handleForgotPassword() {
    const email = String(loginForm.email || '').trim()
    navigate(email ? `/recuperar-senha?email=${encodeURIComponent(email)}` : '/recuperar-senha')
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
            <div className="register-photo-panel">
              <div className="register-photo-preview">
                {registerFotoPreviewUrl ? (
                  <img src={registerFotoPreviewUrl} alt="Foto de perfil selecionada" />
                ) : (
                  <div className="register-photo-placeholder">
                    <span>FP</span>
                  </div>
                )}
              </div>
              <div className="register-photo-actions">
                <label htmlFor="registerFoto">Foto de perfil</label>
                <input
                  ref={registerFotoInputRef}
                  id="registerFoto"
                  name="foto"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={updateRegisterField}
                  className="register-photo-input"
                />
                <div className="register-photo-buttons">
                  <button type="button" className="secondary" onClick={() => registerFotoInputRef.current?.click()}>
                    Escolha uma foto de perfil
                  </button>
                  {registerForm.foto ? (
                    <button type="button" className="secondary" onClick={clearRegisterPhoto}>
                      Remover foto
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
            <div className="field">
              <label htmlFor="registerNome">Nome</label>
              <input id="registerNome" name="nome" value={registerForm.nome} onChange={updateRegisterField} required />
            </div>
            <div className="field">
              <label htmlFor="registerSobrenome">Sobrenome</label>
              <input id="registerSobrenome" name="sobrenome" value={registerForm.sobrenome} onChange={updateRegisterField} required />
            </div>
            <div className="row">
              <div className="field">
                <label htmlFor="registerFuncao">Função</label>
                <select id="registerFuncao" name="funcao" value={registerForm.funcao} onChange={updateRegisterField} required>
                  {ROLE_OPTIONS.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="registerEmail">E-mail pessoal</label>
                <input id="registerEmail" name="email" type="email" value={registerForm.email} onChange={updateRegisterField} required />
              </div>
            </div>
            <div className="row">
              <div className="field">
                <label htmlFor="registerEmailCorporativo">E-mail corporativo</label>
                <select
                  id="registerEmailCorporativo"
                  name="emailCorporativo"
                  value={registerForm.emailCorporativo}
                  onChange={updateRegisterField}
                  required
                >
                  <option value="">Selecione o e-mail corporativo</option>
                  {CORPORATE_EMAIL_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
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
            <button type="submit" disabled={loading}>{loading ? 'Registrando...' : 'Criar conta'}</button>
          </form>
        )}

        {isRegistrationCodeModalOpen ? (
          <div className="phone-code-overlay" role="dialog" aria-modal="true" aria-label="Confirmar e-mail de cadastro">
            <form className="phone-code-modal panel" onSubmit={confirmRegistrationCode}>
              <h3>Confirmar e-mail de cadastro</h3>
              <p>Digite o código enviado para {registrationEmailTarget || registerForm.email}.</p>
              <div className="field">
                <label htmlFor="registrationCodeInput">Código de confirmação</label>
                <input
                  id="registrationCodeInput"
                  value={registrationVerificationCode}
                  onChange={(event) => setRegistrationVerificationCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  inputMode="numeric"
                  required
                />
              </div>
              <button type="submit">Confirmar código</button>
              <button type="button" className="secondary" onClick={resendRegistrationCode} disabled={resendLoading}>
                {resendLoading ? 'Reenviando...' : 'Reenviar código'}
              </button>
              <button type="button" className="secondary" onClick={closeRegistrationCodeModal}>Cancelar</button>
            </form>
          </div>
        ) : null}
      </div>
    </section>
  )
}

export default AuthPage
