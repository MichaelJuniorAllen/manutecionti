import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

function ProtectedRoute({ children }) {
  const { isAuthenticated, loadingSession } = useAuth()
  const location = useLocation()

  if (loadingSession) {
    return <div className="loading-block">Carregando sessão...</div>
  }

  if (!isAuthenticated) {
    const next = encodeURIComponent(location.pathname)
    return <Navigate to={`/autenticacao?next=${next}`} replace />
  }

  return children
}

export default ProtectedRoute
