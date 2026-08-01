import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import './App.css'
import HomePage from './components/HomePage'
import AuthPage from './components/auth/AuthPage'
import PasswordResetPage from './components/auth/PasswordResetPage'
import ProtectedRoute from './components/ProtectedRoute'
import ProfileMenu from './components/common/ProfileMenu'
import { useAuth } from './context/AuthContext'
import { api } from './services/api'
import { formatPriority, getFullName } from './pages/pageHelpers'

const loadNewTicketPage = () => import('./pages/NewTicketPage')
const loadHistoryPage = () => import('./pages/HistoryPage')
const loadProfilePage = () => import('./pages/ProfilePage')
const loadMyHistoryPage = () => import('./pages/MyHistoryPage')
const loadSettingsPage = () => import('./pages/SettingsPage')

const NewTicketPage = lazy(loadNewTicketPage)
const HistoryPage = lazy(loadHistoryPage)
const ProfilePage = lazy(loadProfilePage)
const MyHistoryPage = lazy(loadMyHistoryPage)
const SettingsPage = lazy(loadSettingsPage)

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
    beep({ startAt: t0, frequency: 1200, duration: 0.18, type: 'square', volume: 1.0 })
    beep({ startAt: t0 + 0.22, frequency: 1200, duration: 0.18, type: 'square', volume: 1.0 })
    beep({ startAt: t0 + 0.44, frequency: 1200, duration: 0.18, type: 'square', volume: 1.0 })
    beep({ startAt: t0 + 0.72, frequency: 880, duration: 0.30, type: 'sawtooth', volume: 0.9 })
    beep({ startAt: t0 + 1.08, frequency: 1400, duration: 0.40, type: 'square', volume: 1.0 })

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

  const routeFallback = <div className="loading-block">Carregando página...</div>

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

  const notify = useCallback((type, message) => {
    setToast({ type, message })
  }, [])

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

  const prefetchRoute = useCallback((path) => {
    switch (path) {
      case '/novo-chamado': {
        void loadNewTicketPage()
        return
      }
      case '/chamados': {
        // Antecipar também os chunks internos carregados na rota de chamados.
        void Promise.all([
          loadHistoryPage(),
          import('./components/Stats'),
          import('./components/TicketList'),
        ])
        return
      }
      case '/perfil': {
        void Promise.all([
          loadProfilePage(),
          import('./components/UserDashboard'),
        ])
        return
      }
      case '/meu-historico': {
        void loadMyHistoryPage()
        return
      }
      case '/configuracoes': {
        void Promise.all([
          loadSettingsPage(),
          import('react-easy-crop'),
        ])
        return
      }
      default:
        return
    }
  }, [])

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
        const result = await api.tickets.mine({}, { timeoutMs: 4000 })
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
              onRouteIntent={prefetchRoute}
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
          element={(
            <Suspense fallback={routeFallback}>
              <NewTicketPage onNotify={notify} />
            </Suspense>
          )}
        />
        <Route
          path="/chamados"
          element={(
            <ProtectedRoute>
              <Suspense fallback={routeFallback}>
                <HistoryPage
                  onNotify={notify}
                  currentUserId={user?.id || ''}
                  currentUserName={getFullName(user)}
                />
              </Suspense>
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
              <Suspense fallback={routeFallback}>
                <ProfilePage user={user} />
              </Suspense>
            </ProtectedRoute>
          )}
        />
        <Route
          path="/meu-historico"
          element={(
            <ProtectedRoute>
              <Suspense fallback={routeFallback}>
                <MyHistoryPage onNotify={notify} currentUserName={getFullName(user)} currentUserId={user?.id || ''} />
              </Suspense>
            </ProtectedRoute>
          )}
        />
        <Route
          path="/configuracoes"
          element={(
            <ProtectedRoute>
              <Suspense fallback={routeFallback}>
                <SettingsPage user={user} onNotify={notify} onRefreshUser={refreshUser} onUserUpdated={setUser} />
              </Suspense>
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

      {loadingSession ? <div className="loading-block">Carregando aplicação...</div> : null}
    </main>
  )
}

export default App
