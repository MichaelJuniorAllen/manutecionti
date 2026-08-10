import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import Avatar from '../components/common/Avatar'
import { api } from '../services/api'
import { getCroppedImageFile } from '../utils/imageCrop'
import {
  ROLE_OPTIONS,
  formatPhoneDisplay,
  formatPhoneInput,
  getFullName,
  getProfilePhotoSrc,
  normalizeEmailInput,
  splitFullName,
} from './pageHelpers'

const Cropper = lazy(() => import('react-easy-crop'))

function SettingsPage({ user, onNotify, onRefreshUser, onUserUpdated }) {
  const [activeSection, setActiveSection] = useState('preferences')
  const [settings, setSettings] = useState({ notifications: true, compactMode: false })
  const initialNameParts = splitFullName(user)
  const [nome, setNome] = useState(initialNameParts.nome)
  const [sobrenome, setSobrenome] = useState(initialNameParts.sobrenome)
  const [funcao, setFuncao] = useState(ROLE_OPTIONS.includes(user?.funcao) ? user?.funcao : 'TI')
  const [telefone, setTelefone] = useState(user?.telefone || '')
  const [novoTelefone, setNovoTelefone] = useState('')
  const [pendingPhoneTarget, setPendingPhoneTarget] = useState('')
  const [phoneVerificationCode, setPhoneVerificationCode] = useState('')
  const [isPhoneCodeModalOpen, setIsPhoneCodeModalOpen] = useState(false)
  const [isCurrentPhoneConfirmModalOpen, setIsCurrentPhoneConfirmModalOpen] = useState(false)
  const [smsStatus, setSmsStatus] = useState(null)
  const [foto, setFoto] = useState(null)
  const [primaryEmail, setPrimaryEmail] = useState(user?.email || '')
  const [reserveEmail, setReserveEmail] = useState(user?.email_reserva || '')
  const [isEmailEditEnabled, setIsEmailEditEnabled] = useState(false)
  const [pendingEmailTarget, setPendingEmailTarget] = useState('')
  const [emailVerificationCode, setEmailVerificationCode] = useState('')
  const [isEmailCodeModalOpen, setIsEmailCodeModalOpen] = useState(false)
  const [isCurrentEmailConfirmModalOpen, setIsCurrentEmailConfirmModalOpen] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordVerificationCode, setPasswordVerificationCode] = useState('')
  const [isPasswordCodeModalOpen, setIsPasswordCodeModalOpen] = useState(false)
  const [fotoPreviewUrl, setFotoPreviewUrl] = useState('')
  const [cropImageSource, setCropImageSource] = useState('')
  const [isCropModalOpen, setIsCropModalOpen] = useState(false)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null)
  const [pendingPhotoName, setPendingPhotoName] = useState('')
  const [applyingCrop, setApplyingCrop] = useState(false)
  const [isProfileEditEnabled, setIsProfileEditEnabled] = useState(false)
  const photoInputRef = useRef(null)

  useEffect(() => {
    const nextNameParts = splitFullName(user)
    setNome(nextNameParts.nome)
    setSobrenome(nextNameParts.sobrenome)
    setFuncao(ROLE_OPTIONS.includes(user?.funcao) ? user?.funcao : 'TI')
    setTelefone(user?.telefone || '')
    setPrimaryEmail(user?.email || '')
    setReserveEmail(user?.email_reserva || '')
  }, [user])

  useEffect(() => () => {
    if (fotoPreviewUrl) {
      URL.revokeObjectURL(fotoPreviewUrl)
    }
    if (cropImageSource) {
      URL.revokeObjectURL(cropImageSource)
    }
  }, [cropImageSource, fotoPreviewUrl])

  function closeCropModal({ clearInput = false } = {}) {
    setIsCropModalOpen(false)
    setCrop({ x: 0, y: 0 })
    setZoom(1)
    setCroppedAreaPixels(null)
    setPendingPhotoName('')
    if (cropImageSource) {
      URL.revokeObjectURL(cropImageSource)
      setCropImageSource('')
    }
    if (clearInput && photoInputRef.current) {
      photoInputRef.current.value = ''
    }
  }

  useEffect(() => {
    api.settings
      .me()
      .then((result) => {
        setSettings(result.settings)
        localStorage.setItem('chamados_notifications', String(Boolean(result?.settings?.notifications ?? true)))
      })
      .catch((error) => onNotify('error', error.message))
  }, [onNotify])

  async function handleNotificationToggle(checked) {
    setSettings((current) => ({ ...current, notifications: checked }))
    localStorage.setItem('chamados_notifications', String(Boolean(checked)))

    if (!checked) return
    if (typeof window === 'undefined' || !('Notification' in window)) return

    if (Notification.permission === 'default') {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        onNotify('warning', 'Permita notificações no navegador para receber alertas de novos chamados.')
      }
    } else if (Notification.permission === 'denied') {
      onNotify('warning', 'As notificações estão bloqueadas no navegador. Ative nas permissões do site.')
    }
  }

  async function saveSettings() {
    try {
      await api.settings.update(settings)
      localStorage.setItem('chamados_notifications', String(Boolean(settings.notifications)))
      onNotify('success', 'Configurações salvas com sucesso.')
    } catch (error) {
      onNotify('error', error.message)
    }
  }

  async function handleProfileSubmit(event) {
    event.preventDefault()

    if (!isProfileEditEnabled) {
      onNotify('warning', 'Clique em "Deseja fazer alterações?" para habilitar edição do perfil público.')
      return
    }

    try {
      const formData = new FormData()
      formData.append('nome', nome)
      formData.append('sobrenome', sobrenome)
      formData.append('funcao', funcao)
      if (foto) {
        formData.append('foto', foto)
      }

      const result = await api.profile.update(formData)
      const optimisticUser = {
        ...(user || {}),
        ...(result?.user || {}),
        nome: `${nome} ${sobrenome}`.trim(),
        sobrenome,
        funcao,
        telefone: result?.user?.telefone || user?.telefone || '',
      }
      const updatedProfile = result?.user || optimisticUser

      if (onUserUpdated) {
        onUserUpdated(optimisticUser)
      } else {
        await onRefreshUser()
      }

      const nextNameParts = splitFullName(updatedProfile)
      setNome(nextNameParts.nome)
      setSobrenome(nextNameParts.sobrenome)
      setFuncao(optimisticUser.funcao || 'TI')
      setTelefone(optimisticUser.telefone || '')
      setFoto(null)
      if (fotoPreviewUrl) {
        URL.revokeObjectURL(fotoPreviewUrl)
      }
      setFotoPreviewUrl('')
      if (photoInputRef.current) {
        photoInputRef.current.value = ''
      }
      setIsProfileEditEnabled(false)
      onNotify('success', 'Dados pessoais atualizados com sucesso.')
    } catch (error) {
      onNotify('error', error.message)
    }
  }

  function handleEnableProfileEdit(event) {
    event.preventDefault()
    event.stopPropagation()
    setIsProfileEditEnabled(true)
    onNotify('success', 'Edição habilitada. Agora você pode alterar foto, nome e função.')
  }

  function handleCancelProfileEdit(event) {
    event.preventDefault()
    setIsProfileEditEnabled(false)
    const nextNameParts = splitFullName(user)
    setNome(nextNameParts.nome)
    setSobrenome(nextNameParts.sobrenome)
    setFuncao(ROLE_OPTIONS.includes(user?.funcao) ? user?.funcao : 'TI')
    setFoto(null)
    if (fotoPreviewUrl) {
      URL.revokeObjectURL(fotoPreviewUrl)
    }
    setFotoPreviewUrl('')
    if (photoInputRef.current) {
      photoInputRef.current.value = ''
    }
  }

  function handlePhotoChange(event) {
    const file = event.target.files?.[0] || null
    if (!file) {
      setFoto(null)
      return
    }

    const acceptedTypes = ['image/jpeg', 'image/png', 'image/webp']
    if (!acceptedTypes.includes(file.type)) {
      onNotify('warning', 'Use uma imagem JPG, PNG ou WEBP para a foto de perfil.')
      if (photoInputRef.current) {
        photoInputRef.current.value = ''
      }
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      onNotify('warning', 'A foto deve ter no máximo 5MB.')
      if (photoInputRef.current) {
        photoInputRef.current.value = ''
      }
      return
    }

    if (cropImageSource) {
      URL.revokeObjectURL(cropImageSource)
    }

    setPendingPhotoName(file.name || 'foto-perfil.jpg')
    setCropImageSource(URL.createObjectURL(file))
    setIsCropModalOpen(true)
  }

  function onCropComplete(_croppedArea, nextCroppedAreaPixels) {
    setCroppedAreaPixels(nextCroppedAreaPixels)
  }

  async function applyCropSelection() {
    if (!cropImageSource || !croppedAreaPixels) {
      onNotify('warning', 'Ajuste o enquadramento antes de aplicar o recorte.')
      return
    }

    try {
      setApplyingCrop(true)
      const croppedFile = await getCroppedImageFile(cropImageSource, croppedAreaPixels, pendingPhotoName)

      if (fotoPreviewUrl) {
        URL.revokeObjectURL(fotoPreviewUrl)
      }

      setFoto(croppedFile)
      setFotoPreviewUrl(URL.createObjectURL(croppedFile))
      closeCropModal()
      onNotify('success', 'Foto recortada com sucesso. Salve os dados para aplicar.')
    } catch {
      onNotify('error', 'Não foi possível recortar a imagem selecionada.')
    } finally {
      setApplyingCrop(false)
    }
  }

  function clearSelectedPhoto() {
    if (fotoPreviewUrl) {
      URL.revokeObjectURL(fotoPreviewUrl)
    }
    setFoto(null)
    setFotoPreviewUrl('')
    if (photoInputRef.current) {
      photoInputRef.current.value = ''
    }
  }

  async function saveEmails(event) {
    event.preventDefault()

    if (!isEmailEditEnabled) {
      onNotify('warning', 'Clique em "Deseja fazer alterações?" para habilitar edição de e-mails.')
      return
    }

    const targetEmail = normalizeEmailInput(primaryEmail)
    const currentEmail = normalizeEmailInput(user?.email || '')

    if (!targetEmail) {
      onNotify('warning', 'Insira um e-mail pessoal válido.')
      return
    }

    if (targetEmail === currentEmail) {
      setIsCurrentEmailConfirmModalOpen(true)
      return
    }

    await startEmailChangeRequest(targetEmail)
  }

  async function startEmailChangeRequest(targetEmailValue) {
    const targetEmail = normalizeEmailInput(targetEmailValue)
    if (!targetEmail) {
      onNotify('warning', 'Insira um e-mail pessoal válido.')
      return
    }

    try {
      const result = await api.profile.requestEmailChange(targetEmail)
      setPendingEmailTarget(targetEmail)
      setEmailVerificationCode('')
      setIsEmailCodeModalOpen(true)
      setIsCurrentEmailConfirmModalOpen(false)

      if (!result?.smtpConfigured && result?.debugCode) {
        onNotify('warning', `Ambiente local sem serviço de e-mail: use o código ${result.debugCode} para confirmar.`)
      } else {
        onNotify('success', 'Código de confirmação enviado para o novo e-mail.')
      }
    } catch (error) {
      onNotify('error', error.message)
    }
  }

  function handleEnableEmailEdit(event) {
    event.preventDefault()
    setIsEmailEditEnabled(true)
    onNotify('success', 'Edição de e-mail pessoal habilitada.')
  }

  function handleCancelEmailEdit(event) {
    event.preventDefault()
    setIsEmailEditEnabled(false)
    setPrimaryEmail(user?.email || '')
    setPendingEmailTarget('')
    setEmailVerificationCode('')
    setIsEmailCodeModalOpen(false)
    setIsCurrentEmailConfirmModalOpen(false)
  }

  function closeCurrentEmailConfirmModal() {
    setIsCurrentEmailConfirmModalOpen(false)
  }

  async function confirmCurrentEmailAndContinue() {
    await startEmailChangeRequest(normalizeEmailInput(user?.email || ''))
  }

  async function confirmEmailChangeCode(event) {
    event.preventDefault()

    const code = String(emailVerificationCode || '').trim()
    if (!code) {
      onNotify('warning', 'Informe o código de confirmação recebido no e-mail.')
      return
    }

    try {
      const result = await api.profile.confirmEmailChange(code)
      if (result?.user && onUserUpdated) {
        onUserUpdated(result.user)
      } else {
        await onRefreshUser()
      }

      setIsEmailEditEnabled(false)
      setPendingEmailTarget('')
      setEmailVerificationCode('')
      setIsEmailCodeModalOpen(false)
      onNotify('success', 'E-mail pessoal atualizado com sucesso.')
    } catch (error) {
      onNotify('error', error.message)
    }
  }

  function closeEmailCodeModal() {
    setIsEmailCodeModalOpen(false)
    setEmailVerificationCode('')
  }

  async function submitPhoneChange(event) {
    event.preventDefault()

    const normalizedNewPhone = String(novoTelefone || '').replace(/\D/g, '')
    const normalizedCurrentPhone = String(user?.telefone || '').replace(/\D/g, '')

    if (!normalizedNewPhone) {
      onNotify('warning', 'Insira novo telefone.')
      return
    }

    if (normalizedNewPhone === normalizedCurrentPhone) {
      setIsCurrentPhoneConfirmModalOpen(true)
      return
    }

    await startPhoneChangeRequest(normalizedNewPhone)
  }

  async function startPhoneChangeRequest(phoneDigits) {
    const normalizedTarget = String(phoneDigits || '').replace(/\D/g, '')
    if (!normalizedTarget) {
      onNotify('warning', 'Insira novo telefone.')
      return
    }

    try {
      const response = await api.profile.requestPhoneChange(normalizedTarget)
      setPendingPhoneTarget(normalizedTarget)
      setPhoneVerificationCode('')
      setIsPhoneCodeModalOpen(true)
      setIsCurrentPhoneConfirmModalOpen(false)

      if (!response?.smsConfigured && response?.debugCode) {
        onNotify('warning', `Ambiente local sem SMS: use o código ${response.debugCode} para confirmar.`)
      } else if (response?.emailSent) {
        onNotify('success', `Código enviado para o e-mail ${response.userEmail}${response?.smsConfigured ? ' e por SMS.' : '.'}`)
      } else {
        onNotify('success', 'Código de segurança enviado por SMS para o novo telefone.')
      }
    } catch (error) {
      onNotify('error', error.message)
    }
  }

  function closeCurrentPhoneConfirmModal() {
    setIsCurrentPhoneConfirmModalOpen(false)
  }

  async function confirmCurrentPhoneAndContinue() {
    await startPhoneChangeRequest(String(user?.telefone || '').replace(/\D/g, ''))
  }

  async function confirmPhoneChangeCode(event) {
    event.preventDefault()

    const code = String(phoneVerificationCode || '').trim()
    if (!code) {
      onNotify('warning', 'Informe o código de segurança recebido por SMS.')
      return
    }

    try {
      const result = await api.profile.confirmPhoneChange(code)
      if (result?.user && onUserUpdated) {
        onUserUpdated(result.user)
      } else {
        await onRefreshUser()
      }

      setNovoTelefone('')
      setPendingPhoneTarget('')
      setPhoneVerificationCode('')
      setIsPhoneCodeModalOpen(false)
      onNotify('success', 'Telefone atualizado com sucesso.')
      setActiveSection('security')
    } catch (error) {
      onNotify('error', error.message)
    }
  }

  function closePhoneCodeModal() {
    setIsPhoneCodeModalOpen(false)
    setPhoneVerificationCode('')
  }

  function openPhoneChangeSection() {
    setNovoTelefone('')
    setPendingPhoneTarget('')
    setPhoneVerificationCode('')
    setIsPhoneCodeModalOpen(false)
    setIsCurrentPhoneConfirmModalOpen(false)
    setSmsStatus(null)
    setActiveSection('security-phone')
  }

  useEffect(() => {
    if (activeSection !== 'security-phone') return

    let cancelled = false

    api.profile
      .smsStatus()
      .then((result) => {
        if (cancelled) return
        setSmsStatus({
          configured: Boolean(result?.smsConfigured),
          provider: result?.provider || 'desconhecido',
          missing: Array.isArray(result?.smsMissingConfig) ? result.smsMissingConfig : [],
        })
      })
      .catch(() => {
        if (cancelled) return
        setSmsStatus({ configured: false, provider: 'desconhecido', missing: [] })
      })

    return () => {
      cancelled = true
    }
  }, [activeSection])

  async function submitPasswordChange(event) {
    event.preventDefault()

    if (!currentPassword || !newPassword || !confirmPassword) {
      onNotify('warning', 'Preencha senha atual, nova senha e confirmação.')
      return
    }

    if (newPassword !== confirmPassword) {
      onNotify('warning', 'A confirmação da nova senha não confere.')
      return
    }

    try {
      const result = await api.profile.requestPasswordChange({ currentPassword, newPassword })

      if (result?.debugCode) {
        onNotify('warning', `Ambiente local sem serviço de e-mail: use o código ${result.debugCode} para confirmar.`)
      } else {
        onNotify('success', 'Código enviado para seu e-mail pessoal. Confirme para concluir a troca da senha.')
      }

      setPasswordVerificationCode('')
      setIsPasswordCodeModalOpen(true)
    } catch (error) {
      onNotify('error', error.message)
    }
  }

  async function confirmPasswordChangeCode(event) {
    event.preventDefault()

    const code = String(passwordVerificationCode || '').trim()
    if (!code) {
      onNotify('warning', 'Informe o código de confirmação enviado por e-mail.')
      return
    }

    try {
      const result = await api.profile.confirmPasswordChange(code)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setPasswordVerificationCode('')
      setIsPasswordCodeModalOpen(false)
      onNotify('success', result.message || 'Senha atualizada com sucesso.')
      setActiveSection('security')
    } catch (error) {
      onNotify('error', error.message)
    }
  }

  function closePasswordCodeModal() {
    setIsPasswordCodeModalOpen(false)
    setPasswordVerificationCode('')
  }

  const isSecuritySectionActive = activeSection === 'security'
    || activeSection === 'security-phone'
    || activeSection === 'security-password'
  const currentPhoneDisplay = formatPhoneDisplay(user?.telefone || '')

  return (
    <section className="settings-page">
      <section className="panel settings-shell">
        <aside className="settings-sidebar">
          <div className="settings-user-summary">
            <Avatar user={user} size={56} />
            <div>
              <strong>{getFullName(user)}</strong>
              <p>{user?.funcao || 'TI'}</p>
            </div>
          </div>

          <nav className="settings-nav" aria-label="Navegação das configurações">
            <button
              type="button"
              className={activeSection === 'preferences' ? 'settings-nav-item active' : 'settings-nav-item'}
              onClick={() => setActiveSection('preferences')}
            >
              Preferências
            </button>
            <button
              type="button"
              className={activeSection === 'profile' ? 'settings-nav-item active' : 'settings-nav-item'}
              onClick={() => setActiveSection('profile')}
            >
              Perfil público
            </button>
            <button
              type="button"
              className={activeSection === 'email' ? 'settings-nav-item active' : 'settings-nav-item'}
              onClick={() => setActiveSection('email')}
            >
              E-mail
            </button>
            <button
              type="button"
              className={isSecuritySectionActive ? 'settings-nav-item active' : 'settings-nav-item'}
              onClick={() => setActiveSection('security')}
            >
              Segurança
            </button>
          </nav>
        </aside>

        <section className="settings-content">
          {activeSection === 'preferences' ? (
            <section className="settings-card">
              <div className="settings-card-header">
                <h2>Preferências</h2>
                <p>Ajuste como você quer receber alertas e visualizar a plataforma.</p>
              </div>

              <label className="pref-option">
                <div>
                  <strong>Notificações de novos chamados</strong>
                  <small>Exibe alerta e toca som quando um novo chamado entrar no histórico.</small>
                </div>
                <input
                  type="checkbox"
                  checked={settings.notifications}
                  onChange={(event) => handleNotificationToggle(event.target.checked)}
                />
              </label>

              <label className="pref-option">
                <div>
                  <strong>Modo compacto para listas</strong>
                  <small>Reduz espaçamento dos cards e tabelas para exibir mais itens por tela.</small>
                </div>
                <input
                  type="checkbox"
                  checked={settings.compactMode}
                  onChange={(event) => setSettings((current) => ({ ...current, compactMode: event.target.checked }))}
                />
              </label>

              <button type="button" onClick={saveSettings}>Salvar configurações</button>
            </section>
          ) : null}

          {activeSection === 'profile' ? (
            <form className="settings-card" onSubmit={handleProfileSubmit}>
              <div className="settings-card-header">
                <h2>Perfil público</h2>
                <p>Atualize o nome exibido, a função e a foto de perfil.</p>
              </div>

              <div className="profile-photo-editor">
                <label>Foto de perfil</label>
                <div className="profile-photo-editor-row">
                  <div className="profile-photo-preview">
                    {fotoPreviewUrl || getProfilePhotoSrc(user) ? (
                      <img
                        src={fotoPreviewUrl || getProfilePhotoSrc(user)}
                        alt={user?.nome || 'Usuário'}
                        className="profile-photo-image"
                      />
                    ) : (
                      <Avatar user={user} size={180} />
                    )}
                  </div>

                  <div className="profile-photo-actions">
                    <button
                      type="button"
                      className="secondary"
                      disabled={!isProfileEditEnabled}
                      onClick={() => photoInputRef.current?.click()}
                    >
                      Editar foto
                    </button>
                    {foto ? (
                      <button
                        type="button"
                        className="secondary"
                        disabled={!isProfileEditEnabled}
                        onClick={clearSelectedPhoto}
                      >
                        Cancelar alteração
                      </button>
                    ) : null}
                    <small>Formatos: JPG, PNG, WEBP. Tamanho máximo: 5MB.</small>
                  </div>
                </div>
                <input
                  ref={photoInputRef}
                  id="settingsFoto"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="profile-photo-input-hidden"
                  disabled={!isProfileEditEnabled}
                  onChange={handlePhotoChange}
                />

                {isCropModalOpen && cropImageSource ? (
                  <div className="photo-crop-overlay" role="dialog" aria-modal="true" aria-label="Recortar foto de perfil">
                    <div className="photo-crop-modal panel">
                      <div className="photo-crop-header">
                        <h3>Recortar foto</h3>
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => closeCropModal({ clearInput: true })}
                        >
                          Cancelar
                        </button>
                      </div>

                      <Suspense fallback={<div className="loading-block">Carregando editor de imagem...</div>}>
                        <div className="photo-crop-frame">
                          <Cropper
                            image={cropImageSource}
                            crop={crop}
                            zoom={zoom}
                            aspect={1}
                            cropShape="round"
                            showGrid={false}
                            onCropChange={setCrop}
                            onZoomChange={setZoom}
                            onCropComplete={onCropComplete}
                          />
                        </div>
                      </Suspense>

                      <div className="photo-crop-controls">
                        <label htmlFor="cropZoomRange">Zoom</label>
                        <input
                          id="cropZoomRange"
                          type="range"
                          min="1"
                          max="3"
                          step="0.01"
                          value={zoom}
                          onChange={(event) => setZoom(Number(event.target.value))}
                        />
                      </div>

                      <div className="photo-crop-actions">
                        <button
                          type="button"
                          onClick={applyCropSelection}
                          disabled={applyingCrop}
                        >
                          {applyingCrop ? 'Aplicando...' : 'Aplicar recorte'}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="field">
                <label htmlFor="settingsNome">Nome</label>
                <input
                  id="settingsNome"
                  value={nome}
                  onChange={(event) => setNome(event.target.value)}
                  disabled={!isProfileEditEnabled}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="settingsSobrenome">Sobrenome</label>
                <input
                  id="settingsSobrenome"
                  value={sobrenome}
                  onChange={(event) => setSobrenome(event.target.value)}
                  disabled={!isProfileEditEnabled}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="settingsFuncao">Função</label>
                <select
                  id="settingsFuncao"
                  className="funcao-select"
                  value={funcao}
                  disabled={!isProfileEditEnabled}
                  onChange={(event) => setFuncao(event.target.value)}
                  required
                >
                  {ROLE_OPTIONS.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>

              {!isProfileEditEnabled ? (
                <button type="button" onClick={handleEnableProfileEdit}>
                  Deseja fazer alterações?
                </button>
              ) : (
                <>
                  <button type="submit">Salvar dados pessoais</button>
                  <button type="button" className="secondary" onClick={handleCancelProfileEdit}>Cancelar edição</button>
                </>
              )}
            </form>
          ) : null}

          {activeSection === 'email' ? (
            <section className="settings-card settings-stack">
              <div className="settings-card-header">
                <h2>E-mail</h2>
                <p>Configure seu e-mail atual e o e-mail de reserva para recuperação.</p>
              </div>

              <form className="settings-inline-form" onSubmit={saveEmails}>
                <div className="field">
                  <label htmlFor="settingsPrimaryEmail">Email pessoal</label>
                  <input
                    id="settingsPrimaryEmail"
                    type="email"
                    value={primaryEmail}
                    disabled={!isEmailEditEnabled}
                    onChange={(event) => setPrimaryEmail(event.target.value)}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="settingsReserveEmail">Email corporativo</label>
                  <input
                    id="settingsReserveEmail"
                    type="email"
                    value={reserveEmail}
                    disabled
                    placeholder="exemplo.reserva@dominio.com"
                  />
                </div>
                <p className="settings-inline-tip">O botão abaixo altera somente o e-mail pessoal e exige confirmação por código.</p>
                {!isEmailEditEnabled ? (
                  <button type="button" onClick={handleEnableEmailEdit}>Deseja fazer alterações?</button>
                ) : (
                  <>
                    <button type="submit">Salvar e-mail pessoal</button>
                    <button type="button" className="secondary" onClick={handleCancelEmailEdit}>Cancelar edição</button>
                  </>
                )}
              </form>

              {isEmailCodeModalOpen ? (
                <div className="phone-code-overlay" role="dialog" aria-modal="true" aria-label="Confirmar código de e-mail">
                  <form className="phone-code-modal panel" onSubmit={confirmEmailChangeCode}>
                    <h3>Confirmar código de e-mail</h3>
                    <p>
                      Digite o código enviado para {pendingEmailTarget || normalizeEmailInput(primaryEmail)}.
                    </p>
                    <div className="field">
                      <label htmlFor="emailCodeInput">Código de confirmação</label>
                      <input
                        id="emailCodeInput"
                        value={emailVerificationCode}
                        onChange={(event) => setEmailVerificationCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="000000"
                        inputMode="numeric"
                        required
                      />
                    </div>
                    <button type="submit">Confirmar código</button>
                    <button type="button" className="secondary" onClick={closeEmailCodeModal}>Cancelar</button>
                  </form>
                </div>
              ) : null}

              {isCurrentEmailConfirmModalOpen ? (
                <div className="phone-code-overlay" role="dialog" aria-modal="true" aria-label="Confirmar e-mail atual">
                  <div className="phone-code-modal panel">
                    <h3>Confirmar e-mail atual</h3>
                    <p>
                      Deseja confirmar seu e-mail atual {normalizeEmailInput(user?.email || '')}?
                    </p>
                    <button type="button" onClick={confirmCurrentEmailAndContinue}>Sim</button>
                    <button type="button" className="secondary" onClick={closeCurrentEmailConfirmModal}>Não</button>
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}

          {activeSection === 'security' ? (
            <section className="settings-card settings-stack">
              <div className="settings-card-header">
                <h2>Segurança</h2>
                <p>Escolha qual informação de segurança você deseja alterar.</p>
                <p><strong>Telefone atual:</strong> {currentPhoneDisplay}</p>
              </div>

              <button type="button" onClick={openPhoneChangeSection}>Trocar telefone</button>
              <button type="button" onClick={() => setActiveSection('security-password')}>Trocar senha</button>
            </section>
          ) : null}

          {activeSection === 'security-phone' ? (
            <>
              <form className="settings-card" onSubmit={submitPhoneChange}>
                <div className="settings-card-header">
                  <h2>Trocar telefone</h2>
                  <p>Atualize seu número de telefone cadastrado.</p>
                  <p><strong>Telefone atual:</strong> {currentPhoneDisplay}</p>
                  {smsStatus ? (
                    <div className={smsStatus.configured ? 'sms-status sms-status-ok' : 'sms-status sms-status-fallback'}>
                      <strong>
                        {smsStatus.configured ? 'SMS real ativo' : 'Fallback local ativo'}
                      </strong>
                      {!smsStatus.configured ? (
                        <span>Configure o Twilio para envio real.</span>
                      ) : null}
                      {!smsStatus.configured && smsStatus.missing?.length ? (
                        <small>Faltando: {smsStatus.missing.join(', ')}</small>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <div className="field">
                  <label htmlFor="settingsTelefone">Insira novo telefone</label>
                  <input
                    id="settingsTelefone"
                    value={novoTelefone}
                    onChange={(event) => setNovoTelefone(formatPhoneInput(event.target.value))}
                    placeholder="(xx) xxxxx-xxxx"
                    required
                  />
                </div>

                <button type="submit">Salvar telefone</button>
                <button type="button" className="secondary" onClick={() => setActiveSection('security')}>Voltar</button>
              </form>

              {isPhoneCodeModalOpen ? (
                <div className="phone-code-overlay" role="dialog" aria-modal="true" aria-label="Confirmar código SMS">
                  <form className="phone-code-modal panel" onSubmit={confirmPhoneChangeCode}>
                    <h3>Confirmar código de segurança</h3>
                    <p>
                      Digite o código de segurança enviado para o seu e-mail e/ou por SMS para {formatPhoneDisplay(pendingPhoneTarget)}.
                    </p>
                    <div className="field">
                      <label htmlFor="phoneCodeInput">Código de segurança</label>
                      <input
                        id="phoneCodeInput"
                        value={phoneVerificationCode}
                        onChange={(event) => setPhoneVerificationCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="000000"
                        inputMode="numeric"
                        required
                      />
                    </div>
                    <button type="submit">Confirmar código</button>
                    <button type="button" className="secondary" onClick={closePhoneCodeModal}>Cancelar</button>
                  </form>
                </div>
              ) : null}

              {isCurrentPhoneConfirmModalOpen ? (
                <div className="phone-code-overlay" role="dialog" aria-modal="true" aria-label="Confirmar telefone atual">
                  <div className="phone-code-modal panel">
                    <h3>Confirmar telefone atual</h3>
                    <p>
                      Deseja confirmar seu número de telefone atual {formatPhoneDisplay(user?.telefone || '')}?
                    </p>
                    <button type="button" onClick={confirmCurrentPhoneAndContinue}>Sim</button>
                    <button type="button" className="secondary" onClick={closeCurrentPhoneConfirmModal}>Não</button>
                  </div>
                </div>
              ) : null}
            </>
          ) : null}

          {activeSection === 'security-password' ? (
            <>
              <form className="settings-card" onSubmit={submitPasswordChange}>
                <div className="settings-card-header">
                  <h2>Trocar senha</h2>
                  <p>Informe a senha atual e defina uma nova senha.</p>
                </div>

                <div className="field">
                  <label htmlFor="settingsCurrentPassword">Senha atual</label>
                  <input
                    id="settingsCurrentPassword"
                    type="password"
                    value={currentPassword}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="settingsNewPassword">Nova senha</label>
                  <input
                    id="settingsNewPassword"
                    type="password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="settingsConfirmPassword">Confirmar nova senha</label>
                  <input
                    id="settingsConfirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                  />
                </div>

                <button type="submit">Salvar senha</button>
                <button type="button" className="secondary" onClick={() => setActiveSection('security')}>Voltar</button>
              </form>

              {isPasswordCodeModalOpen ? (
                <div className="phone-code-overlay" role="dialog" aria-modal="true" aria-label="Confirmar código de troca de senha">
                  <form className="phone-code-modal panel" onSubmit={confirmPasswordChangeCode}>
                    <h3>Confirmar código de e-mail</h3>
                    <p>
                      Digite o código enviado para {normalizeEmailInput(user?.email || '')}.
                    </p>
                    <div className="field">
                      <label htmlFor="passwordCodeInput">Código de confirmação</label>
                      <input
                        id="passwordCodeInput"
                        value={passwordVerificationCode}
                        onChange={(event) => setPasswordVerificationCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="000000"
                        inputMode="numeric"
                        required
                      />
                    </div>
                    <button type="submit">Confirmar código</button>
                    <button type="button" className="secondary" onClick={closePasswordCodeModal}>Cancelar</button>
                  </form>
                </div>
              ) : null}
            </>
          ) : null}
        </section>
      </section>
    </section>
  )
}

export default SettingsPage