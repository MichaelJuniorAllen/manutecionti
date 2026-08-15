import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import Toast from './components/Toast'
import { useAuth } from './context/AuthContext'
import DashboardPage from './pages/DashboardPage'
import LoginPage from './pages/LoginPage'
import MyHistoryPage from './pages/MyHistoryPage'
import NewTicketPage from './pages/NewTicketPage'
import ReportPage from './pages/ReportPage'
import TicketDetailPage from './pages/TicketDetailPage'
import TicketListPage from './pages/TicketListPage'

function HomeRedirect() {
  const { user, loading } = useAuth()

  if (loading) {
    return <div className="fullscreen-loader">Carregando aplicação...</div>
  }

  return <Navigate to={user ? '/dashboard' : '/login'} replace />
}

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<HomeRedirect />} />
        <Route path="/login" element={<LoginPage />} />
        <Route
          element={(
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          )}
        >
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/tickets" element={<TicketListPage />} />
          <Route path="/tickets/new" element={<NewTicketPage />} />
          <Route path="/tickets/:id" element={<TicketDetailPage />} />
          <Route path="/my-history" element={<MyHistoryPage />} />
          <Route path="/reports" element={<ReportPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toast />
    </>
  )
}
