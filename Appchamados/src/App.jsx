import { useEffect, useState } from 'react'
import './App.css'
import HomePage from './components/HomePage'
import Stats from './components/Stats'
import TicketForm from './components/TicketForm'
import TicketList from './components/TicketList'
import { getTickets } from './utils/tickets'

function App() {
  const [tickets, setTickets] = useState(() => getTickets())
  const [refreshKey, setRefreshKey] = useState(0)
  const [view, setView] = useState('home')

  useEffect(() => {
    setTickets(getTickets())
  }, [refreshKey])

  function handleSaved() {
    setTickets(getTickets())
    setRefreshKey((value) => value + 1)
  }

  function renderHeader(title, subtitle) {
    return (
      <header>
        <div>
          <h1>{title}</h1>
          <p className="subtitle">{subtitle}</p>
        </div>
      </header>
    )
  }

  return (
    <main className="page">
      {view === 'home' && (
        <>
          {renderHeader('Sistema de chamados', 'Escolha uma opção para cadastrar ou acompanhar solicitações.')}
          <HomePage onNavigate={setView} />
        </>
      )}

      {view === 'cadastro' && (
        <>
          {renderHeader('Registrar novo chamado', 'Use esta página para cadastrar solicitações de manutenção de TI.')}
          <TicketForm onSaved={handleSaved} onNavigate={setView} />
        </>
      )}

      {view === 'registro' && (
        <>
          {renderHeader('Histórico de chamados', 'Veja todas as solicitações registradas e atualizadas em tempo real.')}
          <Stats tickets={tickets} />
          <TicketList refreshKey={refreshKey} />
        </>
      )}
    </main>
  )
}

export default App
