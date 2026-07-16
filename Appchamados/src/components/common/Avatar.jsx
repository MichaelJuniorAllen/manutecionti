import { useEffect, useMemo, useState } from 'react'
import { getMediaUrl } from '../../services/api'

function getInitials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return 'US'
  const first = parts[0]?.[0] || ''
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] || '' : ''
  return `${first}${last}`.toUpperCase()
}

function Avatar({ user, size = 40, name, photoUrl }) {
  const style = { width: `${size}px`, height: `${size}px` }
  const displayName = String(name ?? user?.nome ?? '').trim()
  const resolvedPhotoUrl = useMemo(() => getMediaUrl(photoUrl ?? user?.foto_perfil ?? ''), [photoUrl, user?.foto_perfil])
  const [imageFailed, setImageFailed] = useState(false)

  useEffect(() => {
    setImageFailed(false)
  }, [resolvedPhotoUrl])

  if (resolvedPhotoUrl && !imageFailed) {
    return (
      <img
        src={resolvedPhotoUrl}
        alt={displayName || 'Usuário'}
        className="avatar"
        style={style}
        onError={() => setImageFailed(true)}
      />
    )
  }

  return (
    <div className="avatar avatar-fallback" style={style} aria-label="Avatar do usuário">
      {getInitials(displayName)}
    </div>
  )
}

export default Avatar
