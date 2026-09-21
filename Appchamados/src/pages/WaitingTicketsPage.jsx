import { Suspense, lazy, useCallback, useEffect, useState } from 'react'
import { api } from '../services/api'
import { readTicketsCache, writeTicketsCache } from './pageHelpers'

const TicketList = lazy(() => import('../components/TicketList'))

// Filtro fixo: esta aba so busca chamados pausados, o que reduz o volume de dados
// trafegados e o trabalho de renderizacao em relacao a lista completa de "Chamados".
const WAITING_STATUS = 'Aguardando Continuação'

async function retry(action, { attempts = 3, waitMs = 1200 } = {}) {
  let lastError

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await action()
    } catch (error) {
      lastError = error
      if (attempt >= attempts) {
        break
      }
      await new Promise((resolve) => window.setTimeout(resolve, waitMs * attempt))
    }
  }

  throw lastError
}

function WaitingTicketsPage({ onNotify, currentUserId, currentUserName }) {
  const cachedInitialTickets = readTicketsCache({ status: WAITING_STATUS })
  const [tickets, setTickets] = useState(() => cachedInitialTickets?.tickets || [])
  const [loading, setLoading] = useState(() => !cachedInitialTickets)
  const [connectError, setConnectError] = useState(null)

  const loadTickets = useCallback(async ({ silent = false, notifyOnError = true, isInitial = false } = {}) => {
    try {
      if (!silent) {
        setLoading(true)
      }

      const result = await retry(
        () => api.tickets.mine({ status: WAITING_STATUS }, { timeoutMs: isInitial ? 8000 : 6000 }),
        { attempts: isInitial ? 2 : 1, waitMs: 900 },
      )
      writeTicketsCache({ status: WAITING_STATUS }, result)
      setTickets(result.tickets || [])
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

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const payload = { status, ...extras }
        // Retomar/concluir aqui segue o mesmo fluxo de status do backend, entao o
        // historico do usuario e atualizado normalmente, como nas outras abas.
        await api.tickets.updateStatus(ticketId, payload, { timeoutMs: 15000 })

        if (status === 'Concluído') {
          onNotify('success', 'Chamado concluído e enviado para o seu histórico.')
        } else if (status === 'Em andamento') {
          onNotify('success', 'Atendimento retomado com sucesso.')
        } else {
          onNotify('success', 'Status atualizado com sucesso.')
        }
        await loadTickets({ silent: true, notifyOnError: false })
        return
      } catch (error) {
        const isNetworkError = !error.message
          || error.message.toLowerCase().includes('fetch')
          || error.code === 'REQUEST_TIMEOUT'
          || Number(error?.status) === 408
        if (isNetworkError && attempt < MAX_RETRIES) {
          await new Promise((resolve) => window.setTimeout(resolve, 800 * attempt))
          continue
        }
        onNotify('error', isNetworkError ? 'Servidor indisponível após várias tentativas. Aguarde e tente novamente.' : error.message)
        return
      }
    }
  }

  if (loading) {
    return <div className="loading-block">Carregando chamados em espera...</div>
  }

  return (
    <>
      {connectError ? (
        <div className="toast-message warning">{connectError}</div>
      ) : null}
      <Suspense fallback={<div className="loading-block">Carregando lista de chamados...</div>}>
        <TicketList
          tickets={tickets}
          onUpdateStatus={handleUpdateStatus}
          currentUserId={currentUserId}
          currentUserName={currentUserName}
          hideStatusFilter
          emptyMessage="Nenhum chamado em espera no momento."
        />
      </Suspense>
    </>
  )
}

export default WaitingTicketsPage
