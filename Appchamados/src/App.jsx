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
import ProtectedRoute from './components/ProtectedRoute'
import MyHistoryTable from './components/MyHistoryTable'
import ProfileMenu from './components/common/ProfileMenu'
import Avatar from './components/common/Avatar'
import UserDashboard from './components/UserDashboard'
import { useAuth } from './context/AuthContext'
import { api } from './services/api'
import { getCroppedImageFile } from './utils/imageCrop'

const TEN_MINUTES_MS = 10 * 60 * 1000
const ROLE_OPTIONS = ['Manutenção', 'TI']

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
  if (user.foto_perfil.startsWith('http')) return user.foto_perfil
  return `${import.meta.env.VITE_SERVER_URL || 'http://localhost:4000'}${user.foto_perfil}`
}

function playAlertSound() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    if (!AudioContextClass) return

    const context = new AudioContextClass()
    const masterGain = context.createGain()
    masterGain.gain.value = 0.0001
    masterGain.connect(context.destination)

    function beep({ startAt, frequency, duration, type = 'square' }) {
      const oscillator = context.createOscillator()
      const gain = context.createGain()

      oscillator.type = type
      oscillator.frequency.setValueAtTime(frequency, startAt)

      gain.gain.setValueAtTime(0.0001, startAt)
      gain.gain.exponentialRampToValueAtTime(0.3, startAt + 0.015)
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration)

      oscillator.connect(gain)
      gain.connect(masterGain)
      oscillator.start(startAt)
      oscillator.stop(startAt + duration)
    }

    const t0 = context.currentTime
    beep({ startAt: t0, frequency: 980, duration: 0.12 })
    beep({ startAt: t0 + 0.16, frequency: 660, duration: 0.16 })
    beep({ startAt: t0 + 0.36, frequency: 1040, duration: 0.2, type: 'sawtooth' })

    masterGain.gain.exponentialRampToValueAtTime(0.8, t0 + 0.03)
    masterGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.65)

    window.setTimeout(() => {
      context.close().catch(() => {})
    }, 900)
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
  const reminderTimestampsRef = useRef(new Map())
  const hasHydratedNotificationStateRef = useRef(false)
  const notificationsEnabledRef = useRef(true)

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
        subtitle: 'Use esta página para cadastrar solicitações de manutenção de TI.',
      },
      '/historico': {
        title: 'Histórico de chamados',
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

  useEffect(() => {
    if (!isAuthenticated) {
      knownTicketIdsRef.current = new Set()
      reminderTimestampsRef.current = new Map()
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
      try {
        const result = await api.tickets.mine()
        const allTickets = result.tickets || []
        const openTickets = allTickets.filter((ticket) => ticket.status !== 'Concluído')
        const openTicketIds = new Set(openTickets.map((ticket) => String(ticket.id)))

        if (!hasHydratedNotificationStateRef.current) {
          knownTicketIdsRef.current = new Set(allTickets.map((ticket) => String(ticket.id)))
          const now = Date.now()
          openTickets.forEach((ticket) => {
            reminderTimestampsRef.current.set(String(ticket.id), now)
          })
          hasHydratedNotificationStateRef.current = true
          return
        }

        const previousKnownIds = knownTicketIdsRef.current
        const now = Date.now()

        const newOpenTickets = openTickets.filter((ticket) => !previousKnownIds.has(String(ticket.id)))
        for (const ticket of newOpenTickets) {
          await notifyTicket(ticket, false)
          reminderTimestampsRef.current.set(String(ticket.id), now)
        }

        openTickets.forEach((ticket) => {
          const id = String(ticket.id)
          if (!reminderTimestampsRef.current.has(id)) {
            reminderTimestampsRef.current.set(id, now)
            return
          }

          const lastNotifiedAt = reminderTimestampsRef.current.get(id) || 0
          if (now - lastNotifiedAt >= TEN_MINUTES_MS) {
            notifyTicket(ticket, true)
            reminderTimestampsRef.current.set(id, now)
          }
        })

        for (const id of [...reminderTimestampsRef.current.keys()]) {
          if (!openTicketIds.has(String(id))) {
            reminderTimestampsRef.current.delete(id)
          }
        }

        knownTicketIdsRef.current = new Set(allTickets.map((ticket) => String(ticket.id)))
      } catch {
        // Não interrompe app se falhar a sincronização de notificações.
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
        <Route
          path="/novo-chamado"
          element={<NewTicketPage onNotify={notify} />}
        />
        <Route
          path="/historico"
          element={(
            <ProtectedRoute>
              <HistoryPage
                onNotify={notify}
                currentUserId={user?.id || ''}
                currentUserName={user?.nome || ''}
              />
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
              <MyHistoryPage onNotify={notify} currentUserName={user?.nome || ''} />
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

function NewTicketPage({ onNotify }) {
  const navigate = useNavigate()

  async function handleSubmitTicket(values) {
    await api.tickets.create({
      titulo: values.title,
      descricao: values.description,
      area: values.area,
      solicitante: values.requester,
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

  async function handleUpdateStatus(ticketId, status) {
    try {
      const payload = { status }
      if (status === 'Em andamento' && currentUserName) {
        payload.tecnicoResponsavel = currentUserName
      }

      await api.tickets.updateStatus(ticketId, payload)
      if (status === 'Concluído') {
        onNotify('success', 'Chamado concluído e enviado para o seu histórico.')
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
      <Stats tickets={todayTickets} />
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
        <p><strong>Nome:</strong> {user?.nome}</p>
        <p><strong>E-mail:</strong> {user?.email}</p>
        <p><strong>Telefone:</strong> {user?.telefone}</p>
        <p><strong>Data de cadastro:</strong> {user?.data_cadastro ? new Date(user.data_cadastro).toLocaleString('pt-BR') : '--'}</p>
        <p><strong>Último acesso:</strong> {user?.ultimo_acesso ? new Date(user.ultimo_acesso).toLocaleString('pt-BR') : '--'}</p>
        <p className="panel-tip">Para alterar dados pessoais, e-mail e senha, use a página de Configurações.</p>
      </div>

      <UserDashboard dashboard={dashboard} />
    </section>
  )
}

function MyHistoryPage({ onNotify, currentUserName }) {
  const [tickets, setTickets] = useState([])
  const [allTickets, setAllTickets] = useState([])
  const [filters, setFilters] = useState({
    selectedDate: '',
    selectedMonth: '',
    day: '',
    month: '',
    year: '',
    status: 'Concluído',
    priority: 'todos',
    area: 'todos',
    responsible: currentUserName || 'todos',
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
      responsible: currentUserName || 'todos',
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
        'Fechamento',
        'Tempo total',
        'Observacoes',
      ]],
      body: tickets.map((ticket) => ([
        ticket.numeroChamado || '--',
        formatDateForPdf(ticket.dataAbertura),
        ticket.area || '--',
        ticket.prioridade || '--',
        ticket.status || '--',
        ticket.tecnicoResponsavel || '--',
        formatDateForPdf(ticket.dataFechamento),
        formatResolutionForPdf(ticket.tempoResolucao),
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
      </div>

      <MyHistoryTable tickets={tickets} />

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
  const [nome, setNome] = useState(user?.nome || '')
  const [funcao, setFuncao] = useState(ROLE_OPTIONS.includes(user?.funcao) ? user?.funcao : 'TI')
  const [telefone, setTelefone] = useState(user?.telefone || '')
  const [foto, setFoto] = useState(null)
  const [primaryEmail, setPrimaryEmail] = useState(user?.email || '')
  const [reserveEmail, setReserveEmail] = useState(user?.email_reserva || '')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [fotoPreviewUrl, setFotoPreviewUrl] = useState('')
  const [cropImageSource, setCropImageSource] = useState('')
  const [isCropModalOpen, setIsCropModalOpen] = useState(false)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null)
  const [pendingPhotoName, setPendingPhotoName] = useState('')
  const [applyingCrop, setApplyingCrop] = useState(false)
  const [isRoleMenuOpen, setIsRoleMenuOpen] = useState(false)
  const photoInputRef = useRef(null)
  const roleMenuRef = useRef(null)

  useEffect(() => {
    setNome(user?.nome || '')
    setFuncao(ROLE_OPTIONS.includes(user?.funcao) ? user?.funcao : 'TI')
    setTelefone(user?.telefone || '')
    setPrimaryEmail(user?.email || '')
    setReserveEmail(user?.email_reserva || '')
  }, [user])

  useEffect(() => {
    function handleClickOutsideRoleMenu(event) {
      if (!roleMenuRef.current) return
      if (!roleMenuRef.current.contains(event.target)) {
        setIsRoleMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutsideRoleMenu)
    return () => {
      document.removeEventListener('mousedown', handleClickOutsideRoleMenu)
    }
  }, [])

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
    try {
      const formData = new FormData()
      formData.append('nome', nome)
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
        nome,
        funcao,
        telefone: telefone || user?.telefone || '',
      }

      if (onUserUpdated) {
        onUserUpdated(optimisticUser)
      } else {
        await onRefreshUser()
      }

      setNome(optimisticUser.nome || '')
      setFuncao(optimisticUser.funcao || 'TI')
      setTelefone(optimisticUser.telefone || '')
      setFoto(null)
      setIsRoleMenuOpen(false)
      if (fotoPreviewUrl) {
        URL.revokeObjectURL(fotoPreviewUrl)
      }
      setFotoPreviewUrl('')
      if (photoInputRef.current) {
        photoInputRef.current.value = ''
      }
      onNotify('success', 'Dados pessoais atualizados com sucesso.')
    } catch (error) {
      onNotify('error', error.message)
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
    try {
      const result = await api.profile.updateEmails({
        email: primaryEmail,
        emailReserva: reserveEmail,
      })
      if (result?.user && onUserUpdated) {
        onUserUpdated(result.user)
      } else {
        await onRefreshUser()
      }
      onNotify('success', 'E-mails atualizados com sucesso.')
    } catch (error) {
      onNotify('error', error.message)
    }
  }

  async function submitSecurity(event) {
    event.preventDefault()

    const hasPhoneChange = String(telefone || '').trim() !== String(user?.telefone || '').trim()
    const hasPasswordInput = Boolean(currentPassword || newPassword || confirmPassword)

    if (!hasPhoneChange && !hasPasswordInput) {
      onNotify('warning', 'Nenhuma alteração de segurança foi informada.')
      return
    }

    try {
      if (hasPhoneChange) {
        const phonePayload = new FormData()
        phonePayload.append('telefone', telefone)
        const profileResult = await api.profile.update(phonePayload)
        if (profileResult?.user && onUserUpdated) {
          onUserUpdated(profileResult.user)
        }
      }

      if (hasPasswordInput) {
        if (!currentPassword || !newPassword || !confirmPassword) {
          onNotify('warning', 'Preencha senha atual, nova senha e confirmação.')
          return
        }

        if (newPassword !== confirmPassword) {
          onNotify('warning', 'A confirmação da nova senha não confere.')
          return
        }

        await api.profile.changePassword({ currentPassword, newPassword })
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
      }

      if (!hasPhoneChange || !onUserUpdated) {
        await onRefreshUser()
      }
      onNotify('success', 'Configurações de segurança atualizadas com sucesso.')
    } catch (error) {
      onNotify('error', error.message)
    }
  }

  return (
    <section className="settings-page">
      <section className="panel settings-shell">
        <aside className="settings-sidebar">
          <div className="settings-user-summary">
            <Avatar user={user} size={56} />
            <div>
              <strong>{user?.nome || 'Usuário'}</strong>
              <p>{user?.funcao || 'Manutenção TI'}</p>
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
              className={activeSection === 'security' ? 'settings-nav-item active' : 'settings-nav-item'}
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
                      onClick={() => photoInputRef.current?.click()}
                    >
                      Editar foto
                    </button>
                    {foto ? (
                      <button
                        type="button"
                        className="secondary"
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
                <input id="settingsNome" value={nome} onChange={(event) => setNome(event.target.value)} required />
              </div>
              <div className="field">
                <label htmlFor="settingsFuncao">Função</label>
                <div className="funcao-picker" ref={roleMenuRef}>
                  <button
                    type="button"
                    className="secondary funcao-add-btn"
                    aria-label="Escolher função"
                    aria-expanded={isRoleMenuOpen}
                    onClick={() => setIsRoleMenuOpen((current) => !current)}
                  >
                    +
                  </button>
                  <input
                    id="settingsFuncao"
                    value={funcao}
                    readOnly
                    required
                  />

                  {isRoleMenuOpen ? (
                    <div className="funcao-menu" role="menu" aria-label="Selecionar função">
                      <p className="funcao-menu-title">Escolha sua função</p>
                      {ROLE_OPTIONS.map((option) => (
                        <button
                          key={option}
                          type="button"
                          className={funcao === option ? 'funcao-menu-item active' : 'funcao-menu-item'}
                          onClick={() => {
                            setFuncao(option)
                            setIsRoleMenuOpen(false)
                          }}
                        >
                          <span>{option}</span>
                          {funcao === option ? <span className="funcao-selected-mark">✓</span> : null}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>

              <button type="submit">Salvar dados pessoais</button>
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
                  <label htmlFor="settingsPrimaryEmail">E-mail atual cadastrado</label>
                  <input
                    id="settingsPrimaryEmail"
                    type="email"
                    value={primaryEmail}
                    onChange={(event) => setPrimaryEmail(event.target.value)}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="settingsReserveEmail">E-mail de reserva</label>
                  <input
                    id="settingsReserveEmail"
                    type="email"
                    value={reserveEmail}
                    onChange={(event) => setReserveEmail(event.target.value)}
                    placeholder="exemplo.reserva@dominio.com"
                  />
                </div>
                <p className="settings-inline-tip">Deseja cadastrar ou configurar seu e-mail atual e o de reserva? Atualize os dois campos acima.</p>
                <button type="submit">Salvar e-mails</button>
              </form>
            </section>
          )}

          {activeSection === 'security' && (
            <form className="settings-card" onSubmit={submitSecurity}>
              <div className="settings-card-header">
                <h2>Segurança</h2>
                <p>Atualize telefone e senha da conta.</p>
              </div>

              <div className="field">
                <label htmlFor="settingsTelefone">Telefone</label>
                <input
                  id="settingsTelefone"
                  value={telefone}
                  onChange={(event) => setTelefone(event.target.value)}
                  required
                />
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

              <button type="submit">Salvar segurança</button>
            </form>
          )}
        </section>
      </section>
    </section>
  )
}

export default App
