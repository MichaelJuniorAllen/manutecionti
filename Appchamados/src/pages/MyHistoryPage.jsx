import { useEffect, useState } from 'react'
import MyHistoryTable from '../components/MyHistoryTable'
import { api } from '../services/api'
import { readTicketsCache, writeTicketsCache } from './pageHelpers'

function MyHistoryPage({ onNotify, currentUserName, currentUserId }) {
  const sessionActionOptions = ['Iniciou', 'Retomou', 'Pausou', 'Concluiu']
  const pauseReasonOptions = [
    'Final do expediente',
    'Aguardando peça',
    'Aguardando autorização',
    'Aguardando outro setor',
    'Necessita outro técnico',
    'Outro',
  ]
  const initialHistoryFilters = {
    selectedDate: '',
    selectedMonth: '',
    day: '',
    month: '',
    year: '',
    status: 'Concluído',
    priority: 'todos',
    area: 'todos',
    responsible: 'todos',
    lastAction: 'todos',
    pauseReason: 'todos',
    search: '',
  }
  const cachedInitialHistory = readTicketsCache(initialHistoryFilters)
  const [tickets, setTickets] = useState(() => cachedInitialHistory?.tickets || [])
  const [allTickets, setAllTickets] = useState(() => cachedInitialHistory?.tickets || [])
  const [loading, setLoading] = useState(() => !cachedInitialHistory)
  const [filters, setFilters] = useState(initialHistoryFilters)

  useEffect(() => {
    let active = true

    setFilters(initialHistoryFilters)

    api.tickets
      .mine(toApiFilters(initialHistoryFilters))
      .then((result) => {
        if (!active) return

        const remoteTickets = result.tickets || []
        writeTicketsCache(initialHistoryFilters, { tickets: remoteTickets })
        setTickets(remoteTickets)
        setAllTickets(remoteTickets)
      })
      .catch((error) => {
        if (!active) return
        onNotify('error', error.message)
      })
      .finally(() => {
        if (!active) return
        setLoading(false)
      })

    return () => {
      active = false
    }
  }, [currentUserName, onNotify])

  function toApiFilters(activeFilters) {
    const { selectedDate, ...apiFilters } = activeFilters
    return apiFilters
  }

  function applyOpeningDateFilters(items, activeFilters) {
    const day = Number(activeFilters.day)
    const month = Number(activeFilters.month)
    const year = Number(activeFilters.year)

    const hasDay = Number.isFinite(day) && day >= 1 && day <= 31
    const hasMonth = Number.isFinite(month) && month >= 1 && month <= 12
    const hasYear = Number.isFinite(year) && year >= 1900

    if (!hasDay && !hasMonth && !hasYear) return items

    return (items || []).filter((ticket) => {
      if (!ticket?.dataAbertura) return false
      const openedAt = new Date(ticket.dataAbertura)
      if (Number.isNaN(openedAt.getTime())) return false

      if (hasDay && openedAt.getDate() !== day) return false
      if (hasMonth && openedAt.getMonth() + 1 !== month) return false
      if (hasYear && openedAt.getFullYear() !== year) return false
      return true
    })
  }

  function getLastSessionAction(ticket) {
    const sessions = ticket?.sessoes || []
    const lastSession = sessions.length ? sessions[sessions.length - 1] : null
    if (!lastSession) return '--'
    if (lastSession.status === 'Concluído') return 'Concluiu'
    if (lastSession.status === 'Pausado') return 'Pausou'
    if (lastSession.status === 'Em andamento') {
      return lastSession.tipoInicio === 'Retomado' ? 'Retomou' : 'Iniciou'
    }
    return lastSession.status || '--'
  }

  function applyLocalHistoryFilters(items, activeFilters) {
    const query = String(activeFilters.search || '').trim().toLowerCase()

    return applyOpeningDateFilters(items, activeFilters).filter((ticket) => {
      if (activeFilters.status !== 'todos' && ticket.status !== activeFilters.status) return false
      if (activeFilters.priority !== 'todos' && ticket.prioridade !== activeFilters.priority) return false
      if (activeFilters.area !== 'todos' && ticket.area !== activeFilters.area) return false
      if (activeFilters.responsible !== 'todos' && ticket.tecnicoResponsavel !== activeFilters.responsible) return false
      if (activeFilters.lastAction !== 'todos' && getLastSessionAction(ticket) !== activeFilters.lastAction) return false

      if (activeFilters.pauseReason !== 'todos') {
        const hasPauseReason = (ticket.sessoes || []).some((session) => session?.motivoPausa === activeFilters.pauseReason)
        if (!hasPauseReason) return false
      }

      if (!query) return true

      const haystack = `${ticket.numeroChamado || ''} ${ticket.area || ''} ${ticket.tecnicoResponsavel || ''}`.toLowerCase()
      return haystack.includes(query)
    })
  }

  async function applyFilters(nextFilters) {
    setTickets(applyLocalHistoryFilters(allTickets, nextFilters))
  }

  function updateFilter(field, value) {
    let next = { ...filters, [field]: value }

    if (field === 'selectedDate') {
      if (!value) {
        next = {
          ...next,
          selectedMonth: '',
          day: '',
          month: '',
          year: '',
        }
      } else {
        const [year, month, day] = value.split('-').map((part) => Number(part))
        const isValidDate = Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)

        next = {
          ...next,
          selectedMonth: '',
          day: isValidDate ? String(day) : '',
          month: isValidDate ? String(month) : '',
          year: isValidDate ? String(year) : '',
        }
      }
    }

    if (field === 'selectedMonth') {
      if (!value) {
        next = {
          ...next,
          month: '',
          year: '',
        }
      } else {
        const [year, month] = value.split('-').map((part) => Number(part))
        const isValidMonth = Number.isFinite(year) && Number.isFinite(month)

        next = {
          ...next,
          selectedDate: '',
          day: '',
          month: isValidMonth ? String(month) : '',
          year: isValidMonth ? String(year) : '',
        }
      }
    }

    setFilters(next)
    applyFilters(next)
  }

  const areaOptions = [...new Set(allTickets.map((ticket) => ticket.area))]
  const responsibleOptions = [...new Set(allTickets.map((ticket) => ticket.tecnicoResponsavel))]

  function formatDateForPdf(value) {
    if (!value) return '--'
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return '--'
    return parsed.toLocaleString('pt-BR')
  }

  function formatResolutionForPdf(minutes) {
    if (!Number.isFinite(minutes) || minutes < 0) return '--'
    if (minutes >= 60) {
      const h = Math.floor(minutes / 60)
      const m = minutes % 60
      return `${h}h ${m}min`
    }
    return `${minutes} min`
  }

  function formatElapsedForPdf(startAt, endAt) {
    if (!startAt || !endAt) return '--'

    const start = new Date(startAt).getTime()
    const end = new Date(endAt).getTime()

    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
      return '--'
    }

    const durationMs = end - start
    const hours = Math.floor(durationMs / 3600000)
    const minutes = Math.floor((durationMs % 3600000) / 60000)
    const seconds = Math.floor((durationMs % 60000) / 1000)

    if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`
    }

    if (minutes > 0) {
      return `${minutes}m ${seconds}s`
    }

    return `${seconds}s`
  }

  function getInProgressForPdf(ticket) {
    const byDates = formatElapsedForPdf(ticket?.dataAtendimento, ticket?.dataFechamento)
    if (byDates !== '--') {
      return byDates
    }

    return formatResolutionForPdf(ticket?.tempoAndamento)
  }

  function getWorkedByCurrentTechnician(ticket) {
    const sessions = ticket?.sessoes || []
    const total = sessions.reduce((acc, session) => {
      if (String(session?.tecnicoId || '') !== String(currentUserId || '')) return acc
      const value = Number(session?.tempoTrabalhado)
      return Number.isFinite(value) && value > 0 ? acc + value : acc
    }, 0)

    return formatResolutionForPdf(total)
  }

  async function exportHistoryPdf() {
    if (!tickets.length) {
      onNotify('warning', 'Não há chamados para exportar no filtro atual.')
      return
    }

    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable'),
    ])

    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
    const generatedAt = new Date().toLocaleString('pt-BR')

    doc.setFontSize(16)
    doc.text('Meu Historico de Chamados', 14, 14)
    doc.setFontSize(10)
    doc.text(`Usuario: ${currentUserName || 'N/A'}`, 14, 20)
    doc.text(`Gerado em: ${generatedAt}`, 14, 25)

    autoTable(doc, {
      startY: 30,
      head: [[
        'Numero',
        'Abertura',
        'Area',
        'Prioridade',
        'Status',
        'Tecnico',
        'Sessoes',
        'Tempo tecnico',
        'Ultima acao',
        'Fechamento',
        'Tempo total',
        'Tempo andamento',
        'Observacoes',
      ]],
      body: tickets.map((ticket) => ([
        ticket.numeroChamado || '--',
        formatDateForPdf(ticket.dataAbertura),
        ticket.area || '--',
        ticket.prioridade || '--',
        ticket.status || '--',
        ticket.tecnicoResponsavel || '--',
        `${Number(ticket.totalSessoes || 0)} sessoes`,
        getWorkedByCurrentTechnician(ticket),
        getLastSessionAction(ticket),
        formatDateForPdf(ticket.dataFechamento),
        formatResolutionForPdf(ticket.tempoResolucao),
        getInProgressForPdf(ticket),
        ticket.observacoes || '--',
      ])),
      styles: {
        fontSize: 8,
        cellPadding: 2.2,
      },
      headStyles: {
        fillColor: [35, 104, 162],
      },
      alternateRowStyles: {
        fillColor: [244, 246, 241],
      },
      margin: { left: 10, right: 10 },
    })

    const safeDate = new Date().toISOString().slice(0, 10)
    doc.save(`historico-chamados-${safeDate}.pdf`)
    onNotify('success', 'PDF do histórico gerado com sucesso.')
  }

  return (
    <section className="history-page">
      {loading && !tickets.length ? <div className="loading-block">Carregando histórico...</div> : null}
      <div className="tickets-filters history-advanced-filters">
        <input
          className="filter-input"
          placeholder="Buscar por número, área ou técnico"
          value={filters.search}
          onChange={(event) => updateFilter('search', event.target.value)}
        />
        <input
          className="filter-input"
          type="date"
          value={filters.selectedDate}
          onChange={(event) => updateFilter('selectedDate', event.target.value)}
        />
        <input
          id="monthlyFilter"
          className="filter-input filter-input-month"
          type="month"
          title="Filtro por mês"
          aria-label="Filtro por mês"
          value={filters.selectedMonth}
          onChange={(event) => updateFilter('selectedMonth', event.target.value)}
        />
        <select className="filter-select" value={filters.status} onChange={(event) => updateFilter('status', event.target.value)}>
          <option value="todos">Status</option>
          <option value="Aberto">Aberto</option>
          <option value="Em andamento">Em andamento</option>
          <option value="Aguardando Continuação">Aguardando Continuação</option>
          <option value="Concluído">Concluído</option>
        </select>
        <select className="filter-select" value={filters.priority} onChange={(event) => updateFilter('priority', event.target.value)}>
          <option value="todos">Prioridade</option>
          <option value="critica">Crítica</option>
          <option value="alta">Alta</option>
          <option value="media">Média</option>
          <option value="baixa">Baixa</option>
        </select>
        <select className="filter-select" value={filters.area} onChange={(event) => updateFilter('area', event.target.value)}>
          <option value="todos">Área</option>
          {areaOptions.map((area) => (
            <option key={area} value={area}>{area}</option>
          ))}
        </select>
        <select
          className="filter-select"
          value={filters.responsible}
          onChange={(event) => updateFilter('responsible', event.target.value)}
        >
          <option value="todos">Técnico</option>
          {responsibleOptions.map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
        <select
          className="filter-select"
          value={filters.lastAction}
          onChange={(event) => updateFilter('lastAction', event.target.value)}
        >
          <option value="todos">Última ação</option>
          {sessionActionOptions.map((action) => (
            <option key={action} value={action}>{action}</option>
          ))}
        </select>
        <select
          className="filter-select"
          value={filters.pauseReason}
          onChange={(event) => updateFilter('pauseReason', event.target.value)}
        >
          <option value="todos">Motivo da pausa</option>
          {pauseReasonOptions.map((reason) => (
            <option key={reason} value={reason}>{reason}</option>
          ))}
        </select>
      </div>

      <MyHistoryTable tickets={tickets} currentUserId={currentUserId} />

      <button
        type="button"
        className="history-export-fab"
        onClick={exportHistoryPdf}
        title="Baixar PDF do histórico"
        aria-label="Baixar PDF do histórico"
      >
        PDF
      </button>
    </section>
  )
}

export default MyHistoryPage