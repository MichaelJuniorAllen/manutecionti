import { NavLink } from 'react-router-dom'

const links = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/tickets', label: 'Tickets' },
  { to: '/tickets/new', label: 'Novo Chamado' },
  { to: '/my-history', label: 'Meu Histórico' },
  { to: '/reports', label: 'Relatório' }
]

export default function Sidebar({ user, mobileOpen, onClose, onLogout }) {
  return (
    <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}>
      <div className="sidebar-top">
        <div className="brand">
          <div className="brand-icon">🎫</div>
          <div>
            <strong>Chamados Pro</strong>
            <span>Central de atendimento</span>
          </div>
        </div>
        <button type="button" className="icon-button sidebar-close" onClick={onClose}>
          ✕
        </button>
      </div>

      <nav className="sidebar-nav">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            onClick={onClose}
            className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}
          >
            {link.label}
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-user">
        <div>
          <strong>{user?.name}</strong>
          <p>{user?.email}</p>
          <span className="role-chip">{user?.role === 'admin' ? 'Administrador' : 'Usuário'}</span>
        </div>
        <button type="button" className="btn btn-secondary btn-block" onClick={onLogout}>
          Sair
        </button>
      </div>
    </aside>
  )
}
