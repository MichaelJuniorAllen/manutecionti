import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import Cropper from 'react-easy-crop'
import './App.css'
import HomePage from './components/HomePage'
import Stats from './components/Stats'
import TicketForm from './components/TicketForm'
import TicketList from './components/TicketList'
import AuthPage from './components/auth/AuthPage'
import PasswordResetPage from './components/auth/PasswordResetPage'
import ProtectedRoute from './components/ProtectedRoute'
import MyHistoryTable from './components/MyHistoryTable'
import ProfileMenu from './components/common/ProfileMenu'
import Avatar from './components/common/Avatar'
import UserDashboard from './components/UserDashboard'
import { useAuth } from './context/AuthContext'
import { api, getMediaUrl } from './services/api'
import { getCroppedImageFile } from './utils/imageCrop'

const ROLE_OPTIONS = ['Manutenção', 'TI']

function getFullName(user) {
  const firstName = String(user?.nome || '').trim()
  const lastName = String(user?.sobrenome || '').trim()

  if (firstName && lastName) {
    if (firstName.toLowerCase().endsWith(` ${lastName.toLowerCase()}`) || firstName.toLowerCase() === lastName.toLowerCase()) {
      return firstName
    }

    return `${firstName} ${lastName}`
  }

  return firstName || 'Usuário'
}

function splitFullName(user) {
  const rawFirstName = String(user?.nome || '').trim()
  const rawSurname = String(user?.sobrenome || '').trim()

  if (rawSurname) {
    const parts = rawFirstName.split(/\s+/).filter(Boolean)
    return {
      nome: parts[0] || rawFirstName || '',
      sobrenome: rawSurname,
    }
  }

  const parts = rawFirstName.split(/\s+/).filter(Boolean)
  if (parts.length <= 1) {
    return {
      nome: rawFirstName,
      sobrenome: '',
    }
  }

  return {
    nome: parts[0] || '',
    sobrenome: parts.slice(1).join(' '),
  }
}

function formatPriority(priority = '') {
  const labels = {
    critica: 'Crítica',
    alta: 'Alta',
    media: 'Média',
    baixa: 'Baixa',
  }

  return labels[String(priority).toLowerCase()] || 'Não definida'
}

function getProfilePhotoSrc(user) {
  if (!user?.foto_perfil) return ''
  return getMediaUrl(user.foto_perfil)
}

function playAlertSound() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    if (!AudioContextClass) return

    const context = new AudioContextClass()
    const masterGain = context.createGain()
    masterGain.gain.value = 1.0
    masterGain.connect(context.destination)

    function beep({ startAt, frequency, duration, type = 'square', volume = 1.0 }) {
      const oscillator = context.createOscillator()
      const gain = context.createGain()

      oscillator.type = type
      oscillator.frequency.setValueAtTime(frequency, startAt)

      gain.gain.setValueAtTime(0.001, startAt)
      gain.gain.exponentialRampToValueAtTime(volume, startAt + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.001, startAt + duration)

      oscillator.connect(gain)
      gain.connect(masterGain)
      oscillator.start(startAt)
      oscillator.stop(startAt + duration)
    }

    const t0 = context.currentTime
    // Sequência de alerta urgente — 3 grupos de bipes fortes
    beep({ startAt: t0,        frequency: 1200, duration: 0.18, type: 'square',   volume: 1.0 })
    beep({ startAt: t0 + 0.22, frequency: 1200, duration: 0.18, type: 'square',   volume: 1.0 })
    beep({ startAt: t0 + 0.44, frequency: 1200, duration: 0.18, type: 'square',   volume: 1.0 })
    beep({ startAt: t0 + 0.72, frequency: 880,  duration: 0.30, type: 'sawtooth', volume: 0.9 })
    beep({ startAt: t0 + 1.08, frequency: 1400, duration: 0.40, type: 'square',   volume: 1.0 })

    masterGain.gain.setValueAtTime(1.0, t0)
    masterGain.gain.exponentialRampToValueAtTime(0.001, t0 + 1.6)

    window.setTimeout(() => {
      context.close().catch(() => {})
    }, 2000)
  } catch {
    // Mantém fluxo mesmo se áudio falhar por bloqueio do navegador.
  }
}

async function showBrowserNotification({ title, body }) {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false
  }

  if (Notification.permission === 'granted') {
    new Notification(title, { body })
    return true
  }

  if (Notification.permission === 'default') {
    const permission = await Notification.requestPermission()
    if (permission === 'granted') {
      new Notification(title, { body })
      return true
    }
  }

  return false
}

function App() {
  const { user, isAuthenticated, logout, refreshUser, setUser, loadingSession } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [toast, setToast] = useState(null)
  const [siteNotice, setSiteNotice] = useState(null)
  const knownTicketIdsRef = useRef(new Set())
  const hasHydratedNotificationStateRef = useRef(false)
  const notificationsEnabledRef = useRef(true)
  const isSyncingNotificationStateRef = useRef(false)

  const pageMeta = useMemo(() => {
    const map = {
      '/': {
        title: 'Sistema de chamados',
        subtitle: 'Escolha uma opção para cadastrar ou acompanhar solicitações.',
      },
      '/autenticacao': {
        title: 'Autenticação',
        subtitle: 'Entre na sua conta ou registre-se para acessar seus chamados.',
      },
      '/novo-chamado': {
        title: 'Registrar novo chamado',
        subtitle: 'Use esta página para cadastrar solicitações de manutenção e de TI.',
      },
      '/chamados': {
        title: 'Chamados',
        subtitle: 'Acompanhe e atualize solicitações abertas pela sua conta.',
      },
      '/perfil': {
        title: 'Meu Perfil',
        subtitle: 'Gerencie dados pessoais, foto e segurança da sua conta.',
      },
      '/meu-historico': {
        title: 'Meu Histórico de Chamados',
        subtitle: 'Consulte somente os chamados vinculados ao seu perfil.',
      },
      '/configuracoes': {
        title: 'Configurações',
        subtitle: 'Gerencie preferências, dados pessoais, e-mail e senha da sua conta.',
      },
      '/alterar-senha': {
        title: 'Alterar Senha',
        subtitle: 'Atualize sua senha com segurança.',
      },
    }

    return map[location.pathname] || map['/']
  }, [location.pathname])

  useEffect(() => {
    if (!toast) return undefined
    const timer = window.setTimeout(() => setToast(null), 3800)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    if (!siteNotice) return undefined
    const timer = window.setTimeout(() => setSiteNotice(null), 10000)
    return () => window.clearTimeout(timer)
  }, [siteNotice])

  function notify(type, message) {
    setToast({ type, message })
  }

  function handleLogout() {
    logout()
    setMenuOpen(false)
    setSiteNotice(null)
    notify('success', 'Sessão encerrada com sucesso.')
    navigate('/')
  }

  function handleGoBack() {
    if (window.history.length > 1) {
      navigate(-1)
      return
    }

    navigate('/')
  }

  useEffect(() => {
    if (!isAuthenticated) {
      knownTicketIdsRef.current = new Set()
      hasHydratedNotificationStateRef.current = false
      notificationsEnabledRef.current = true
      setSiteNotice(null)
      return undefined
    }

    function updateNotificationPreferenceFromStorage() {
      const stored = localStorage.getItem('chamados_notifications')
      notificationsEnabledRef.current = stored == null ? true : stored === 'true'
    }

    updateNotificationPreferenceFromStorage()
    api.settings
      .me()
      .then((result) => {
        const enabled = Boolean(result?.settings?.notifications ?? true)
        notificationsEnabledRef.current = enabled
        localStorage.setItem('chamados_notifications', String(enabled))
      })
      .catch(() => {})

    function handleStorage(event) {
      if (event.key !== 'chamados_notifications') return
      updateNotificationPreferenceFromStorage()
    }

    async function notifyTicket(ticket, isReminder = false) {
      if (!notificationsEnabledRef.current || !ticket) return

      const priorityLabel = formatPriority(ticket.prioridade)
      const priorityKey = String(ticket.prioridade || '').toLowerCase()
      const title = isReminder ? 'Lembrete de chamado aberto' : 'Novo chamado aberto'
      const body = isReminder
        ? `Lembrete (10 min): chamado ainda aberto: ${ticket.titulo || 'Sem título'} • Prioridade: ${priorityLabel}`
        : `Seguinte chamado aberto: ${ticket.titulo || 'Sem título'} • Prioridade: ${priorityLabel}`

      setSiteNotice({
        id: `${ticket.id}-${Date.now()}`,
        title,
        body,
        priority: priorityKey,
      })

      playAlertSound()
      const shown = await showBrowserNotification({ title, body })
      if (!shown) {
        notify('warning', body)
      }
    }

    async function syncNotificationState() {
      if (isSyncingNotificationStateRef.current) {
        return
      }

      isSyncingNotificationStateRef.current = true

      try {
        const result = await api.tickets.mine()
        const allTickets = result.tickets || []
        const openTickets = allTickets.filter((ticket) => ticket.status !== 'Concluído')

        if (!hasHydratedNotificationStateRef.current) {
          knownTicketIdsRef.current = new Set(allTickets.map((ticket) => String(ticket.id)))
          hasHydratedNotificationStateRef.current = true
          return
        }

        const previousKnownIds = knownTicketIdsRef.current

        const newOpenTickets = openTickets.filter((ticket) => !previousKnownIds.has(String(ticket.id)))
        for (const ticket of newOpenTickets) {
          await notifyTicket(ticket, false)
        }

        knownTicketIdsRef.current = new Set(allTickets.map((ticket) => String(ticket.id)))
      } catch {
        // Não interrompe app se falhar a sincronização de notificações.
      } finally {
        isSyncingNotificationStateRef.current = false
      }
    }

    const streamUrl = api.tickets.streamUrl()
    const eventSource = streamUrl ? new EventSource(streamUrl) : null

    if (eventSource) {
      eventSource.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data || '{}')
          if (payload?.type === 'ticket-created' || payload?.type === 'ticket-updated') {
            syncNotificationState()
            return
          }

          if (payload?.type === 'ticket-reminder' && payload?.ticket) {
            notifyTicket(payload.ticket, true)
          }
        } catch {
          // Ignora evento malformado.
        }
      }
    }

    syncNotificationState()
    const periodicSync = window.setInterval(syncNotificationState, 10000)
    window.addEventListener('storage', handleStorage)

    return () => {
      window.clearInterval(periodicSync)
      window.removeEventListener('storage', handleStorage)
      eventSource?.close()
    }
  }, [isAuthenticated])

  return (
    <main className="page">
      <header>
        <div>
          <h1>{pageMeta.title}</h1>
          <p className="subtitle">{pageMeta.subtitle}</p>
        </div>

        <div className="top-actions">
          {location.pathname === '/novo-chamado' ? (
            <button type="button" className="secondary" onClick={handleGoBack}>
              Voltar
            </button>
          ) : null}

          {isAuthenticated && siteNotice ? (
            <aside className={`site-notice site-notice-${siteNotice.priority || 'media'}`} role="status" aria-live="polite">
              <div className="site-notice-content">
                <strong>{siteNotice.title}</strong>
                <p>{siteNotice.body}</p>
              </div>
              <button
                type="button"
                className="site-notice-close"
                aria-label="Fechar notificação"
                onClick={() => setSiteNotice(null)}
              >
                ×
              </button>
            </aside>
          ) : null}

          {isAuthenticated ? (
            <ProfileMenu
              user={user}
              open={menuOpen}
              onToggle={() => setMenuOpen((current) => !current)}
              onClose={() => setMenuOpen(false)}
              onLogout={handleLogout}
            />
          ) : null}
        </div>
      </header>

      {toast ? <div className={`toast-message ${toast.type}`}>{toast.message}</div> : null}

      <Routes>
        <Route path="/" element={<HomePage onNavigate={(target) => navigate(target)} />} />
        <Route path="/autenticacao" element={<AuthPage onNotify={notify} />} />
        <Route path="/recuperar-senha" element={<PasswordResetPage onNotify={notify} />} />
        <Route
          path="/novo-chamado"
          element={<NewTicketPage onNotify={notify} />}
        />
        <Route
          path="/chamados"
          element={(
            <ProtectedRoute>
              <HistoryPage
                onNotify={notify}
                currentUserId={user?.id || ''}
                currentUserName={getFullName(user)}
              />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/historico"
          element={(
            <ProtectedRoute>
              <Navigate to="/chamados" replace />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/perfil"
          element={(
            <ProtectedRoute>
              <ProfilePage user={user} />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/meu-historico"
          element={(
            <ProtectedRoute>
              <MyHistoryPage onNotify={notify} currentUserName={getFullName(user)} currentUserId={user?.id || ''} />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/configuracoes"
          element={(
            <ProtectedRoute>
              <SettingsPage user={user} onNotify={notify} onRefreshUser={refreshUser} onUserUpdated={setUser} />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/alterar-senha"
          element={(
            <ProtectedRoute>
              <Navigate to="/configuracoes" replace />
            </ProtectedRoute>
          )}
        />
      </Routes>

      {loadingSession && <div className="loading-block">Carregando aplicação...</div>}
    </main>
  )
}

function formatPhoneDisplay(value = '') {
  const digits = String(value || '').replace(/\D/g, '')

  if (!digits) return '--'
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  }

  return digits
}

function formatPhoneInput(value = '') {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 11)

  if (!digits) return ''
  if (digits.length <= 2) return `(${digits}`
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
}

function normalizeEmailInput(value = '') {
  return String(value || '').trim().toLowerCase()
}

function NewTicketPage({ onNotify }) {
  const navigate = useNavigate()

  async function handleSubmitTicket(values) {
    await api.tickets.create({
      titulo: values.title,
      descricao: values.description,
      area: values.area,
      solicitante: values.requester,
      emailCorporativo: values.corporateEmail,
      prioridade: values.priority,
      tecnicoResponsavel: values.responsible,
      observacoes: values.description,
    })
    onNotify('success', 'Seu chamado foi aberto com sucesso!')
  }

  return <TicketForm onSubmitTicket={handleSubmitTicket} onNavigate={(path) => navigate(path)} />
}

function HistoryPage({ onNotify, currentUserId, currentUserName }) {
  const [tickets, setTickets] = useState([])
  const [todayTickets, setTodayTickets] = useState([])
  const [loading, setLoading] = useState(true)

  function getOpenAndInProgress(items) {
    return (items || []).filter((ticket) => ticket.status !== 'Concluído')
  }

  function isSameLocalDay(dateValue) {
    if (!dateValue) return false
    const date = new Date(dateValue)
    if (Number.isNaN(date.getTime())) return false
    const now = new Date()
    return (
      date.getFullYear() === now.getFullYear()
      && date.getMonth() === now.getMonth()
      && date.getDate() === now.getDate()
    )
  }

  function isTicketFromCurrentDay(ticket) {
    if (!ticket) return false

    let referenceDate = ticket.dataAbertura
    if (ticket.status === 'Concluído') {
      referenceDate = ticket.dataFechamento || ticket.dataAtendimento || ticket.dataAbertura
    } else if (ticket.status === 'Em andamento') {
      referenceDate = ticket.dataAtendimento || ticket.dataAbertura
    }

    return isSameLocalDay(referenceDate)
  }

  const loadTickets = useCallback(async ({ silent = false, notifyOnError = true } = {}) => {
    try {
      if (!silent) {
        setLoading(true)
      }

      const result = await api.tickets.mine()
      const allTickets = result.tickets || []
      setTickets(getOpenAndInProgress(allTickets))
      setTodayTickets(allTickets.filter((ticket) => isTicketFromCurrentDay(ticket)))
    } catch (error) {
      if (notifyOnError) {
        onNotify('error', error.message)
      }
    } finally {
      if (!silent) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    loadTickets()

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        loadTickets({ silent: true, notifyOnError: false })
      }
    }

    function handleWindowFocus() {
      loadTickets({ silent: true, notifyOnError: false })
    }

    window.addEventListener('focus', handleWindowFocus)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    // Fallback de sincronização entre contas: atualiza periodicamente
    // mesmo quando o stream não disparar por reconexão/rede.
    const syncInterval = window.setInterval(() => {
      loadTickets({ silent: true, notifyOnError: false })
    }, 2000)

    return () => {
      window.removeEventListener('focus', handleWindowFocus)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.clearInterval(syncInterval)
    }
  }, [loadTickets])

  useEffect(() => {
    const streamUrl = api.tickets.streamUrl()
    if (!streamUrl) {
      return undefined
    }

    const eventSource = new EventSource(streamUrl)

    eventSource.onmessage = async (event) => {
      try {
        const payload = JSON.parse(event.data || '{}')
        if (payload?.type === 'ticket-created' || payload?.type === 'ticket-updated') {
          await loadTickets({ silent: true, notifyOnError: false })
        }
      } catch {
        // Ignore malformed events and keep stream connected.
      }
    }

    eventSource.onerror = () => {
      // EventSource reconecta automaticamente; não mostrar erro para evitar ruído.
    }

    return () => {
      eventSource.close()
    }
  }, [loadTickets])

  async function handleUpdateStatus(ticketId, status, extras = {}) {
    try {
      const payload = { status, ...extras }

      await api.tickets.updateStatus(ticketId, payload)
      if (status === 'Concluído') {
        onNotify('success', 'Chamado concluído e enviado para o seu histórico.')
      } else if (status === 'Aguardando Continuação') {
        onNotify('success', 'Atendimento pausado. Chamado disponível para continuação.')
      } else if (status === 'Em andamento') {
        onNotify('success', 'Atendimento iniciado com sucesso.')
      } else {
        onNotify('success', 'Status atualizado com sucesso.')
      }
      await loadTickets()
    } catch (error) {
      onNotify('error', error.message)
    }
  }

  if (loading) {
    return <div className="loading-block">Carregando chamados...</div>
  }

  return (
    <>
      <Stats tickets={todayTickets} currentUserId={currentUserId} />
      <TicketList
        tickets={tickets}
        onUpdateStatus={handleUpdateStatus}
        currentUserId={currentUserId}
        currentUserName={currentUserName}
      />
    </>
  )
}

function ProfilePage({ user }) {
  const [dashboard, setDashboard] = useState(null)

  useEffect(() => {
    api.tickets
      .dashboard()
      .then((result) => setDashboard(result))
      .catch(() => setDashboard(null))
  }, [])


  return (
    <section className="profile-page">
      <div className="panel profile-data">
        <h2>Resumo do Perfil</h2>
        <p><strong>Nome completo:</strong> {getFullName(user)}</p>
        <p><strong>Sobrenome:</strong> {user?.sobrenome || '--'}</p>
        <p><strong>E-mail:</strong> {user?.email}</p>
        <p><strong>E-mail corporativo:</strong> {user?.email_reserva || '--'}</p>
        <p><strong>Telefone:</strong> {user?.telefone}</p>
        <p><strong>Data de cadastro:</strong> {user?.data_cadastro ? new Date(user.data_cadastro).toLocaleString('pt-BR') : '--'}</p>
        <p><strong>Último acesso:</strong> {user?.ultimo_acesso ? new Date(user.ultimo_acesso).toLocaleString('pt-BR') : '--'}</p>
        <p className="panel-tip">Para alterar dados pessoais, e-mail e senha, use a página de Configurações.</p>
      </div>

      <UserDashboard dashboard={dashboard} />
    </section>
  )
}

function MyHistoryPage({ onNotify, currentUserName, currentUserId }) {
  const [tickets, setTickets] = useState([])
  const [allTickets, setAllTickets] = useState([])
  const sessionActionOptions = ['Iniciou', 'Retomou', 'Pausou', 'Concluiu']
  const pauseReasonOptions = [
    'Final do expediente',
    'Aguardando peça',
    'Aguardando autorização',
    'Aguardando outro setor',
    'Necessita outro técnico',
    'Outro',
  ]
  const [filters, setFilters] = useState({
    selectedDate: '',
    selectedMonth: '',
    day: '',
    month: '',
    year: '',
    status: 'Concluído',
    priority: 'todos',
    area: 'todos',
    responsible: 'todos',
    lastAction: 'todos',
    pauseReason: 'todos',
    search: '',
  })

  useEffect(() => {
    const initialFilters = {
      selectedDate: '',
      selectedMonth: '',
      day: '',
      month: '',
      year: '',
      status: 'Concluído',
      priority: 'todos',
      area: 'todos',
      responsible: 'todos',
      lastAction: 'todos',
      pauseReason: 'todos',
      search: '',
    }

    setFilters(initialFilters)

    api.tickets
      .mine(toApiFilters(initialFilters))
      .then((result) => {
        setTickets(result.tickets || [])
        setAllTickets(result.tickets || [])
      })
      .catch((error) => onNotify('error', error.message))
  }, [currentUserName])

  function toApiFilters(activeFilters) {
    const { selectedDate, ...apiFilters } = activeFilters
    return apiFilters
  }

  function applyOpeningDateFilters(items, activeFilters) {
    const day = Number(activeFilters.day)
    const month = Number(activeFilters.month)
    const year = Number(activeFilters.year)

    const hasDay = Number.isFinite(day) && day >= 1 && day <= 31
    const hasMonth = Number.isFinite(month) && month >= 1 && month <= 12
    const hasYear = Number.isFinite(year) && year >= 1900

    if (!hasDay && !hasMonth && !hasYear) return items

    return (items || []).filter((ticket) => {
      if (!ticket?.dataAbertura) return false
      const openedAt = new Date(ticket.dataAbertura)
      if (Number.isNaN(openedAt.getTime())) return false

      if (hasDay && openedAt.getDate() !== day) return false
      if (hasMonth && openedAt.getMonth() + 1 !== month) return false
      if (hasYear && openedAt.getFullYear() !== year) return false
      return true
    })
  }

  async function applyFilters(nextFilters) {
    try {
      const result = await api.tickets.mine(toApiFilters(nextFilters))
      const remoteTickets = result.tickets || []
      setTickets(applyOpeningDateFilters(remoteTickets, nextFilters))
    } catch (error) {
      onNotify('error', error.message)
    }
  }

  function updateFilter(field, value) {
    let next = { ...filters, [field]: value }

    if (field === 'selectedDate') {
      if (!value) {
        next = {
          ...next,
          selectedMonth: '',
          day: '',
          month: '',
          year: '',
        }
      } else {
        const [year, month, day] = value.split('-').map((part) => Number(part))
        const isValidDate = Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)

        next = {
          ...next,
          selectedMonth: '',
          day: isValidDate ? String(day) : '',
          month: isValidDate ? String(month) : '',
          year: isValidDate ? String(year) : '',
        }
      }
    }

    if (field === 'selectedMonth') {
      if (!value) {
        next = {
          ...next,
          month: '',
          year: '',
        }
      } else {
        const [year, month] = value.split('-').map((part) => Number(part))
        const isValidMonth = Number.isFinite(year) && Number.isFinite(month)

        next = {
          ...next,
          selectedDate: '',
          day: '',
          month: isValidMonth ? String(month) : '',
          year: isValidMonth ? String(year) : '',
        }
      }
    }

    setFilters(next)
    applyFilters(next)
  }

  const areaOptions = [...new Set(allTickets.map((ticket) => ticket.area))]
  const responsibleOptions = [...new Set(allTickets.map((ticket) => ticket.tecnicoResponsavel))]

  function formatDateForPdf(value) {
    if (!value) return '--'
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return '--'
    return parsed.toLocaleString('pt-BR')
  }

  function formatResolutionForPdf(minutes) {
    if (!Number.isFinite(minutes) || minutes < 0) return '--'
    if (minutes >= 60) {
      const h = Math.floor(minutes / 60)
      const m = minutes % 60
      return `${h}h ${m}min`
    }
    return `${minutes} min`
  }

  function formatElapsedForPdf(startAt, endAt) {
    if (!startAt || !endAt) return '--'

    const start = new Date(startAt).getTime()
    const end = new Date(endAt).getTime()

    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
      return '--'
    }

    const durationMs = end - start
    const hours = Math.floor(durationMs / 3600000)
    const minutes = Math.floor((durationMs % 3600000) / 60000)
    const seconds = Math.floor((durationMs % 60000) / 1000)

    if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`
    }

    if (minutes > 0) {
      return `${minutes}m ${seconds}s`
    }

    return `${seconds}s`
  }

  function getInProgressForPdf(ticket) {
    const byDates = formatElapsedForPdf(ticket?.dataAtendimento, ticket?.dataFechamento)
    if (byDates !== '--') {
      return byDates
    }

    return formatResolutionForPdf(ticket?.tempoAndamento)
  }

  function getLastSessionAction(ticket) {
    const sessions = ticket?.sessoes || []
    const lastSession = sessions.length ? sessions[sessions.length - 1] : null
    if (!lastSession) return '--'
    if (lastSession.status === 'Concluído') return 'Concluiu'
    if (lastSession.status === 'Pausado') return 'Pausou'
    if (lastSession.status === 'Em andamento') {
      return lastSession.tipoInicio === 'Retomado' ? 'Retomou' : 'Iniciou'
    }
    return lastSession.status || '--'
  }

  function getWorkedByCurrentTechnician(ticket) {
    const sessions = ticket?.sessoes || []
    const total = sessions.reduce((acc, session) => {
      if (String(session?.tecnicoId || '') !== String(currentUserId || '')) return acc
      const value = Number(session?.tempoTrabalhado)
      return Number.isFinite(value) && value > 0 ? acc + value : acc
    }, 0)

    return formatResolutionForPdf(total)
  }

  function exportHistoryPdf() {
    if (!tickets.length) {
      onNotify('warning', 'Não há chamados para exportar no filtro atual.')
      return
    }

    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
    const generatedAt = new Date().toLocaleString('pt-BR')

    doc.setFontSize(16)
    doc.text('Meu Historico de Chamados', 14, 14)
    doc.setFontSize(10)
    doc.text(`Usuario: ${currentUserName || 'N/A'}`, 14, 20)
    doc.text(`Gerado em: ${generatedAt}`, 14, 25)

    autoTable(doc, {
      startY: 30,
      head: [[
        'Numero',
        'Abertura',
        'Area',
        'Prioridade',
        'Status',
        'Tecnico',
        'Sessoes',
        'Tempo tecnico',
        'Ultima acao',
        'Fechamento',
        'Tempo total',
        'Tempo andamento',
        'Observacoes',
      ]],
      body: tickets.map((ticket) => ([
        ticket.numeroChamado || '--',
        formatDateForPdf(ticket.dataAbertura),
        ticket.area || '--',
        ticket.prioridade || '--',
        ticket.status || '--',
        ticket.tecnicoResponsavel || '--',
        `${Number(ticket.totalSessoes || 0)} sessoes`,
        getWorkedByCurrentTechnician(ticket),
        getLastSessionAction(ticket),
        formatDateForPdf(ticket.dataFechamento),
        formatResolutionForPdf(ticket.tempoResolucao),
        getInProgressForPdf(ticket),
        ticket.observacoes || '--',
      ])),
      styles: {
        fontSize: 8,
        cellPadding: 2.2,
      },
      headStyles: {
        fillColor: [35, 104, 162],
      },
      alternateRowStyles: {
        fillColor: [244, 246, 241],
      },
      margin: { left: 10, right: 10 },
    })

    const safeDate = new Date().toISOString().slice(0, 10)
    doc.save(`historico-chamados-${safeDate}.pdf`)
    onNotify('success', 'PDF do histórico gerado com sucesso.')
  }

  return (
    <section className="history-page">
      <div className="tickets-filters history-advanced-filters">
        <input
          className="filter-input"
          placeholder="Buscar por número, área ou técnico"
          value={filters.search}
          onChange={(event) => updateFilter('search', event.target.value)}
        />
        <input
          className="filter-input"
          type="date"
          value={filters.selectedDate}
          onChange={(event) => updateFilter('selectedDate', event.target.value)}
        />
        <input
          id="monthlyFilter"
          className="filter-input filter-input-month"
          type="month"
          title="Filtro por mês"
          aria-label="Filtro por mês"
          value={filters.selectedMonth}
          onChange={(event) => updateFilter('selectedMonth', event.target.value)}
        />
        <select className="filter-select" value={filters.status} onChange={(event) => updateFilter('status', event.target.value)}>
          <option value="todos">Status</option>
          <option value="Aberto">Aberto</option>
          <option value="Em andamento">Em andamento</option>
          <option value="Aguardando Continuação">Aguardando Continuação</option>
          <option value="Concluído">Concluído</option>
        </select>
        <select className="filter-select" value={filters.priority} onChange={(event) => updateFilter('priority', event.target.value)}>
          <option value="todos">Prioridade</option>
          <option value="critica">Crítica</option>
          <option value="alta">Alta</option>
          <option value="media">Média</option>
          <option value="baixa">Baixa</option>
        </select>
        <select className="filter-select" value={filters.area} onChange={(event) => updateFilter('area', event.target.value)}>
          <option value="todos">Área</option>
          {areaOptions.map((area) => (
            <option key={area} value={area}>{area}</option>
          ))}
        </select>
        <select
          className="filter-select"
          value={filters.responsible}
          onChange={(event) => updateFilter('responsible', event.target.value)}
        >
          <option value="todos">Técnico</option>
          {responsibleOptions.map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
        <select
          className="filter-select"
          value={filters.lastAction}
          onChange={(event) => updateFilter('lastAction', event.target.value)}
        >
          <option value="todos">Última ação</option>
          {sessionActionOptions.map((action) => (
            <option key={action} value={action}>{action}</option>
          ))}
        </select>
        <select
          className="filter-select"
          value={filters.pauseReason}
          onChange={(event) => updateFilter('pauseReason', event.target.value)}
        >
          <option value="todos">Motivo da pausa</option>
          {pauseReasonOptions.map((reason) => (
            <option key={reason} value={reason}>{reason}</option>
          ))}
        </select>
      </div>

      <MyHistoryTable tickets={tickets} currentUserId={currentUserId} />

      <button
        type="button"
        className="history-export-fab"
        onClick={exportHistoryPdf}
        title="Baixar PDF do histórico"
        aria-label="Baixar PDF do histórico"
      >
        PDF
      </button>
    </section>
  )
}

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
  }, [])

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
      if (telefone) {
        formData.append('telefone', telefone)
      }
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
        telefone: telefone || user?.telefone || '',
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
          {activeSection === 'preferences' && (
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
          )}

          {activeSection === 'profile' && (
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
                <button
                  type="button"
                  onClick={handleEnableProfileEdit}
                >
                  Deseja fazer alterações?
                </button>
              ) : (
                <>
                  <button type="submit">Salvar dados pessoais</button>
                  <button type="button" className="secondary" onClick={handleCancelProfileEdit}>Cancelar edição</button>
                </>
              )}
            </form>
          )}

          {activeSection === 'email' && (
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
          )}

          {activeSection === 'security' && (
            <section className="settings-card settings-stack">
              <div className="settings-card-header">
                <h2>Segurança</h2>
                <p>Escolha qual informação de segurança você deseja alterar.</p>
                <p><strong>Telefone atual:</strong> {currentPhoneDisplay}</p>
              </div>

              <button type="button" onClick={openPhoneChangeSection}>Trocar telefone</button>
              <button type="button" onClick={() => setActiveSection('security-password')}>Trocar senha</button>
            </section>
          )}

          {activeSection === 'security-phone' && (
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
          )}

          {activeSection === 'security-password' && (
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
          )}
        </section>
      </section>
    </section>
  )
}

export default App
