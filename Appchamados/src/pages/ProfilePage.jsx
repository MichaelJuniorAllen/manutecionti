import { Suspense, lazy, useEffect, useState } from 'react'
import { api } from '../services/api'
import { getFullName } from './pageHelpers'

const UserDashboard = lazy(() => import('../components/UserDashboard'))

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
        <p><strong>Nome completo:</strong> {getFullName(user)}</p>
        <p><strong>Sobrenome:</strong> {user?.sobrenome || '--'}</p>
        <p><strong>E-mail:</strong> {user?.email}</p>
        <p><strong>E-mail corporativo:</strong> {user?.email_reserva || '--'}</p>
        <p><strong>Telefone:</strong> {user?.telefone}</p>
        <p><strong>Data de cadastro:</strong> {user?.data_cadastro ? new Date(user.data_cadastro).toLocaleString('pt-BR') : '--'}</p>
        <p><strong>Último acesso:</strong> {user?.ultimo_acesso ? new Date(user.ultimo_acesso).toLocaleString('pt-BR') : '--'}</p>
        <p className="panel-tip">Para alterar dados pessoais, e-mail e senha, use a página de Configurações.</p>
      </div>

      <Suspense fallback={<div className="loading-block">Carregando dashboard...</div>}>
        <UserDashboard dashboard={dashboard} />
      </Suspense>
    </section>
  )
}

export default ProfilePage