import { Suspense, lazy, useCallback, useEffect, useState } from 'react'
import { api } from '../services/api'
import { readTicketsCache, writeTicketsCache } from './pageHelpers'

const Stats = lazy(() => import('../components/Stats'))
const TicketList = lazy(() => import('../components/TicketList'))

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

function isTicketFromCurrentDay(ticket) {
  if (!ticket) return false

  let referenceDate = ticket.dataAbertura
  if (ticket.status === 'Concluído') {
    referenceDate = ticket.dataFechamento || ticket.dataAtendimento || ticket.dataAbertura
  } else if (ticket.status === 'Em andamento') {
    referenceDate = ticket.dataAtendimento || ticket.dataAbertura
  }

  return isSameLocalDay(referenceDate)
}

function HistoryPage({ onNotify, currentUserId, currentUserName }) {
  const cachedInitialTickets = readTicketsCache()
  const initialTickets = cachedInitialTickets?.tickets || []
  const [tickets, setTickets] = useState(() => getOpenAndInProgress(initialTickets))
  const [todayTickets, setTodayTickets] = useState(() => initialTickets.filter((ticket) => isTicketFromCurrentDay(ticket)))
  const [loading, setLoading] = useState(() => !cachedInitialTickets)
  const [connectError, setConnectError] = useState(null)

  const loadTickets = useCallback(async ({ silent = false, notifyOnError = true, isInitial = false } = {}) => {
    try {
      if (!silent) {
        setLoading(true)
      }

      const result = await api.tickets.mine()
      writeTicketsCache({}, result)
      const allTickets = result.tickets || []
      setTickets(getOpenAndInProgress(allTickets))
      setTodayTickets(allTickets.filter((ticket) => isTicketFromCurrentDay(ticket)))
      setConnectError(null)
    } catch (error) {
      if (isInitial) {
        setConnectError('Não foi possível conectar ao servidor. Reconectando automaticamente...')
      } else if (notifyOnError) {
        onNotify('error', error.message)
      }
    } finally {
      if (!silent) {
        setLoading(false)
      }
    }
  }, [onNotify])

  useEffect(() => {
    loadTickets({ isInitial: true })

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

    const syncInterval = window.setInterval(() => {
      loadTickets({ silent: true, notifyOnError: false })
    }, 20000)

    return () => {
      window.removeEventListener('focus', handleWindowFocus)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.clearInterval(syncInterval)
    }
  }, [loadTickets])

  useEffect(() => {
    const streamUrl = api.tickets.streamUrl()
    if (!streamUrl) {
      return undefined
    }

    const eventSource = new EventSource(streamUrl)

    eventSource.onmessage = async (event) => {
      try {
        const payload = JSON.parse(event.data || '{}')
        if (payload?.type === 'ticket-created' || payload?.type === 'ticket-updated') {
          await loadTickets({ silent: true, notifyOnError: false })
        }
      } catch {
        // Ignore malformed events and keep stream connected.
      }
    }

    eventSource.onerror = () => {}

    return () => {
      eventSource.close()
    }
  }, [loadTickets])

  async function handleUpdateStatus(ticketId, status, extras = {}) {
    const MAX_RETRIES = 3
    const RETRY_DELAY_MS = 3000

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const payload = { status, ...extras }
        await api.tickets.updateStatus(ticketId, payload)

        if (status === 'Concluído') {
          onNotify('success', 'Chamado concluído e enviado para o seu histórico.')
        } else if (status === 'Aguardando Continuação') {
          onNotify('success', 'Atendimento pausado. Chamado disponível para continuação.')
        } else if (status === 'Em andamento') {
          onNotify('success', 'Atendimento iniciado com sucesso.')
        } else {
          onNotify('success', 'Status atualizado com sucesso.')
        }
        await loadTickets({ silent: true, notifyOnError: false })
        return
      } catch (error) {
        const isNetworkError = !error.message || error.message.toLowerCase().includes('fetch')
        if (isNetworkError && attempt < MAX_RETRIES) {
          await new Promise((resolve) => window.setTimeout(resolve, RETRY_DELAY_MS))
          continue
        }
        onNotify('error', isNetworkError ? 'Servidor indisponível após várias tentativas. Aguarde e tente novamente.' : error.message)
        return
      }
    }
  }

  if (loading) {
    return <div className="loading-block">Carregando chamados...</div>
  }

  return (
    <>
      {connectError ? (
        <div className="toast-message warning">{connectError}</div>
      ) : null}
      <Suspense fallback={<div className="loading-block">Carregando indicadores...</div>}>
        <Stats tickets={todayTickets} currentUserId={currentUserId} />
      </Suspense>
      <Suspense fallback={<div className="loading-block">Carregando lista de chamados...</div>}>
        <TicketList
          tickets={tickets}
          onUpdateStatus={handleUpdateStatus}
          currentUserId={currentUserId}
          currentUserName={currentUserName}
        />
      </Suspense>
    </>
  )
}

export default HistoryPage