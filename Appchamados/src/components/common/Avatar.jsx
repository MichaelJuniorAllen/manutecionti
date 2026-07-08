function getInitials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return 'US'
  const first = parts[0]?.[0] || ''
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] || '' : ''
  return `${first}${last}`.toUpperCase()
}

function Avatar({ user, size = 40 }) {
  const style = { width: `${size}px`, height: `${size}px` }

  if (user?.foto_perfil) {
    const src = user.foto_perfil.startsWith('http')
      ? user.foto_perfil
      : `${import.meta.env.VITE_SERVER_URL || 'http://localhost:4000'}${user.foto_perfil}`

    return <img src={src} alt={user.nome || 'Usuário'} className="avatar" style={style} />
  }

  return (
    <div className="avatar avatar-fallback" style={style} aria-label="Avatar do usuário">
      {getInitials(user?.nome)}
    </div>
  )
}

export default Avatar
