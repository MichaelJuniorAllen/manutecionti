import { useCallback, useEffect, useMemo, useState } from 'react'
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import './App.css'
import HomePage from './components/HomePage'
import Stats from './components/Stats'
import TicketForm from './components/TicketForm'
import TicketList from './components/TicketList'
import AuthPage from './components/auth/AuthPage'
import ProtectedRoute from './components/ProtectedRoute'
import MyHistoryTable from './components/MyHistoryTable'
import ProfileMenu from './components/common/ProfileMenu'
import UserDashboard from './components/UserDashboard'
import { useAuth } from './context/AuthContext'
import { api } from './services/api'

function App() {
  const { user, isAuthenticated, logout, refreshUser, loadingSession } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [toast, setToast] = useState(null)

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
        subtitle: 'Ajuste preferências da plataforma para o seu uso diário.',
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

  function notify(type, message) {
    setToast({ type, message })
  }

  function handleLogout() {
    logout()
    setMenuOpen(false)
    notify('success', 'Sessão encerrada com sucesso.')
    navigate('/')
  }

  return (
    <main className="page">
      <header>
        <div>
          <h1>{pageMeta.title}</h1>
          <p className="subtitle">{pageMeta.subtitle}</p>
        </div>

        <div className="top-actions">
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
              <ProfilePage user={user} onNotify={notify} onRefreshUser={refreshUser} />
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
              <SettingsPage onNotify={notify} />
            </ProtectedRoute>
          )}
        />
        <Route
          path="/alterar-senha"
          element={(
            <ProtectedRoute>
              <ChangePasswordPage onNotify={notify} />
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

  const loadTickets = useCallback(async ({ silent = false, notifyOnError = true } = {}) => {
    try {
      if (!silent) {
        setLoading(true)
      }

      const result = await api.tickets.mine()
      const allTickets = result.tickets || []
      setTickets(getOpenAndInProgress(allTickets))
      setTodayTickets(allTickets.filter((ticket) => isSameLocalDay(ticket.dataAbertura)))
    } catch (error) {
      if (notifyOnError) {
        onNotify('error', error.message)
      }
    } finally {
      if (!silent) {
        setLoading(false)
      }
    }
  }, [onNotify])

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

    return () => {
      window.removeEventListener('focus', handleWindowFocus)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [loadTickets])

  useEffect(() => {
    const streamUrl = api.tickets.streamUrl()
    if (!streamUrl) {
      return undefined
    }

    const eventSource = new EventSource(streamUrl)

    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data || '{}')
        if (payload?.type === 'ticket-created' || payload?.type === 'ticket-updated') {
          loadTickets({ silent: true, notifyOnError: false })
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

function ProfilePage({ user, onNotify, onRefreshUser }) {
  const [nome, setNome] = useState(user?.nome || '')
  const [telefone, setTelefone] = useState(user?.telefone || '')
  const [senha, setSenha] = useState('')
  const [foto, setFoto] = useState(null)
  const [newEmail, setNewEmail] = useState('')
  const [confirmCode, setConfirmCode] = useState('')
  const [dashboard, setDashboard] = useState(null)

  useEffect(() => {
    setNome(user?.nome || '')
    setTelefone(user?.telefone || '')
  }, [user])

  useEffect(() => {
    api.tickets
      .dashboard()
      .then((result) => setDashboard(result))
      .catch(() => setDashboard(null))
  }, [])

  async function handleProfileSubmit(event) {
    event.preventDefault()
    try {
      const formData = new FormData()
      formData.append('nome', nome)
      formData.append('telefone', telefone)
      if (senha.trim()) {
        formData.append('senha', senha)
      }
      if (foto) {
        formData.append('foto', foto)
      }

      await api.profile.update(formData)
      await onRefreshUser()
      setSenha('')
      onNotify('success', 'Perfil atualizado com sucesso.')
    } catch (error) {
      onNotify('error', error.message)
    }
  }

  async function requestEmailChange(event) {
    event.preventDefault()
    try {
      await api.profile.requestEmailChange(newEmail)
      onNotify('warning', 'Código gerado. Confirme a alteração de e-mail com o código recebido.')
    } catch (error) {
      onNotify('error', error.message)
    }
  }

  async function confirmEmailChange(event) {
    event.preventDefault()
    try {
      await api.profile.confirmEmailChange(confirmCode)
      setConfirmCode('')
      setNewEmail('')
      await onRefreshUser()
      onNotify('success', 'E-mail atualizado com confirmação.')
    } catch (error) {
      onNotify('error', error.message)
    }
  }

  return (
    <section className="profile-page">
      <div className="panel profile-data">
        <h2>Informações pessoais</h2>
        <p><strong>Nome:</strong> {user?.nome}</p>
        <p><strong>E-mail:</strong> {user?.email}</p>
        <p><strong>Telefone:</strong> {user?.telefone}</p>
        <p><strong>Data de cadastro:</strong> {user?.data_cadastro ? new Date(user.data_cadastro).toLocaleString('pt-BR') : '--'}</p>
        <p><strong>Último acesso:</strong> {user?.ultimo_acesso ? new Date(user.ultimo_acesso).toLocaleString('pt-BR') : '--'}</p>
      </div>

      <form className="panel profile-edit-form" onSubmit={handleProfileSubmit}>
        <h2>Editar Perfil</h2>
        <div className="field">
          <label htmlFor="profileNome">Nome</label>
          <input id="profileNome" value={nome} onChange={(event) => setNome(event.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="profileTelefone">Telefone</label>
          <input id="profileTelefone" value={telefone} onChange={(event) => setTelefone(event.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="profileSenha">Nova senha (opcional)</label>
          <input id="profileSenha" type="password" value={senha} onChange={(event) => setSenha(event.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="profileFoto">Foto de perfil</label>
          <input
            id="profileFoto"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => setFoto(event.target.files?.[0] || null)}
          />
        </div>
        <button type="submit">Editar Perfil</button>
      </form>

      <form className="panel profile-email-form" onSubmit={requestEmailChange}>
        <h2>Alterar e-mail com confirmação</h2>
        <div className="field">
          <label htmlFor="newEmail">Novo e-mail</label>
          <input id="newEmail" type="email" value={newEmail} onChange={(event) => setNewEmail(event.target.value)} required />
        </div>
        <button type="submit">Solicitar alteração</button>
      </form>

      <form className="panel profile-email-form" onSubmit={confirmEmailChange}>
        <h2>Confirmar código de alteração</h2>
        <div className="field">
          <label htmlFor="confirmCode">Código de confirmação</label>
          <input id="confirmCode" value={confirmCode} onChange={(event) => setConfirmCode(event.target.value)} required />
        </div>
        <button type="submit">Confirmar e-mail</button>
      </form>

      <UserDashboard dashboard={dashboard} />
    </section>
  )
}

function MyHistoryPage({ onNotify, currentUserName }) {
  const [tickets, setTickets] = useState([])
  const [allTickets, setAllTickets] = useState([])
  const [filters, setFilters] = useState({
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
      .mine(initialFilters)
      .then((result) => {
        setTickets(result.tickets || [])
        setAllTickets(result.tickets || [])
      })
      .catch((error) => onNotify('error', error.message))
  }, [currentUserName])

  async function applyFilters(nextFilters) {
    try {
      const result = await api.tickets.mine(nextFilters)
      setTickets(result.tickets || [])
    } catch (error) {
      onNotify('error', error.message)
    }
  }

  function updateFilter(field, value) {
    const next = { ...filters, [field]: value }
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
        <select className="filter-select" value={filters.month} onChange={(event) => updateFilter('month', event.target.value)}>
          <option value="">Mês</option>
          {Array.from({ length: 12 }).map((_, index) => (
            <option key={index + 1} value={index + 1}>{index + 1}</option>
          ))}
        </select>
        <input
          className="filter-input"
          placeholder="Ano"
          value={filters.year}
          onChange={(event) => updateFilter('year', event.target.value)}
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

function SettingsPage({ onNotify }) {
  const [settings, setSettings] = useState({ notifications: true, compactMode: false })

  useEffect(() => {
    api.settings
      .me()
      .then((result) => setSettings(result.settings))
      .catch((error) => onNotify('error', error.message))
  }, [])

  async function save() {
    try {
      await api.settings.update(settings)
      onNotify('success', 'Configurações salvas com sucesso.')
    } catch (error) {
      onNotify('error', error.message)
    }
  }

  return (
    <section className="panel settings-panel">
      <h2>Preferências</h2>
      <label className="check-line">
        <input
          type="checkbox"
          checked={settings.notifications}
          onChange={(event) => setSettings((current) => ({ ...current, notifications: event.target.checked }))}
        />
        Receber notificações
      </label>
      <label className="check-line">
        <input
          type="checkbox"
          checked={settings.compactMode}
          onChange={(event) => setSettings((current) => ({ ...current, compactMode: event.target.checked }))}
        />
        Modo compacto para listas
      </label>
      <button type="button" onClick={save}>Salvar configurações</button>
    </section>
  )
}

function ChangePasswordPage({ onNotify }) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  async function submit(event) {
    event.preventDefault()
    if (newPassword !== confirmPassword) {
      onNotify('warning', 'A confirmação da nova senha não confere.')
      return
    }

    try {
      await api.profile.changePassword({ currentPassword, newPassword })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      onNotify('success', 'Senha alterada com sucesso.')
    } catch (error) {
      onNotify('error', error.message)
    }
  }

  return (
    <form className="panel password-form" onSubmit={submit}>
      <h2>Alterar senha</h2>
      <div className="field">
        <label htmlFor="currentPassword">Senha atual</label>
        <input
          id="currentPassword"
          type="password"
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
          required
        />
      </div>
      <div className="field">
        <label htmlFor="newPassword">Nova senha</label>
        <input id="newPassword" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required />
      </div>
      <div className="field">
        <label htmlFor="confirmPassword">Confirmar nova senha</label>
        <input
          id="confirmPassword"
          type="password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          required
        />
      </div>
      <button type="submit">Atualizar senha</button>
    </form>
  )
}

export default App
