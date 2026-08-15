import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useMemo, useState } from 'react'
import Sidebar from './Sidebar'
import { useAuth } from '../context/AuthContext'
import { showToast } from './Toast'

const titles = {
  '/dashboard': 'Dashboard executivo',
  '/tickets': 'Todos os chamados',
  '/tickets/new': 'Abrir novo chamado',
  '/my-history': 'Meu histórico',
  '/reports': 'Relatório do dia anterior'
}

export default function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuth()

  const title = useMemo(() => {
    if (location.pathname.startsWith('/tickets/') && location.pathname !== '/tickets/new') {
      return 'Detalhes do chamado'
    }

    return titles[location.pathname] || 'Chamados Pro'
  }, [location.pathname])

  function handleLogout() {
    logout()
    showToast('Sessão encerrada com sucesso.', 'success')
    navigate('/login', { replace: true })
  }

  return (
    <div className="app-shell">
      <Sidebar
        user={user}
        mobileOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
        onLogout={handleLogout}
      />
      {mobileOpen ? (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Fechar menu lateral"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}

      <div className="content-shell">
        <header className="topbar">
          <div>
            <button type="button" className="icon-button mobile-menu" onClick={() => setMobileOpen(true)}>
              ☰
            </button>
            <div>
              <h1>{title}</h1>
              <p>Gestão centralizada de tickets, histórico e indicadores.</p>
            </div>
          </div>
          <div className="topbar-user">
            <span className="role-chip role-chip-light">{user?.role === 'admin' ? 'Administrador' : 'Operação'}</span>
            <div>
              <strong>{user?.name}</strong>
              <p>{new Date().toLocaleDateString('pt-BR', { dateStyle: 'full' })}</p>
            </div>
          </div>
        </header>

        <main className="page-content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
