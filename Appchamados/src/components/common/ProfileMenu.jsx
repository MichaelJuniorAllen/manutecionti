import { Link } from 'react-router-dom'
import Avatar from './Avatar'

function ProfileMenu({ user, open, onToggle, onClose, onLogout }) {
  return (
    <div className="profile-menu-wrapper">
      <button type="button" className="avatar-trigger" onClick={onToggle} aria-expanded={open}>
        <Avatar user={user} />
      </button>

      {open && (
        <div className="profile-dropdown" role="menu" onMouseLeave={onClose}>
          <div className="profile-card">
            <Avatar user={user} size={52} />
            <div>
              <strong>{user?.nome}</strong>
              <p>{user?.email}</p>
            </div>
          </div>
          <nav className="profile-links">
            <Link to="/perfil" onClick={onClose}>Meu Perfil</Link>
            <Link to="/meu-historico" onClick={onClose}>Meu Histórico</Link>
            <Link to="/configuracoes" onClick={onClose}>Configurações</Link>
            <Link to="/alterar-senha" onClick={onClose}>Alterar Senha</Link>
            <button type="button" className="logout-menu-btn" onClick={onLogout}>Sair</button>
          </nav>
        </div>
      )}
    </div>
  )
}

export default ProfileMenu
