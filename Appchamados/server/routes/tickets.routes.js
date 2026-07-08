import express from 'express'
import { optionalAuth, requireAuth } from '../middleware/auth.js'
import { createTicketNumber, mutateDatabase, nextNumericId, nowIso, readDatabase } from '../services/database.js'

const router = express.Router()

const priorityToMinutes = {
  critica: 20,
  alta: 60,
  media: 180,
  baixa: 1440,
}

function normalize(value = '') {
  return value.trim().toLowerCase()
}

function computeResolutionMinutes(startIso, endIso) {
  if (!startIso || !endIso) return null
  const start = new Date(startIso).getTime()
  const end = new Date(endIso).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null
  return Math.round((end - start) / 60000)
}

function toTicketResponse(ticket) {
  return {
    id: ticket.id,
    numeroChamado: ticket.numero_chamado,
    dataAbertura: ticket.data_abertura,
    area: ticket.area,
    prioridade: ticket.prioridade,
    status: ticket.status,
    tecnicoResponsavel: ticket.tecnico_responsavel,
    dataFechamento: ticket.data_fechamento,
    tempoResolucao: ticket.tempo_resolucao,
    observacoes: ticket.observacoes,
    solicitante: ticket.solicitante,
    titulo: ticket.titulo,
    descricao: ticket.descricao,
    dueAt: ticket.due_at,
  }
}

router.post('/', optionalAuth, async (req, res) => {
  const payload = {
    titulo: (req.body.titulo || '').trim(),
    descricao: (req.body.descricao || '').trim(),
    area: (req.body.area || '').trim(),
    solicitante: (req.body.solicitante || '').trim(),
    prioridade: (req.body.prioridade || 'media').trim().toLowerCase(),
    tecnico_responsavel: (req.body.tecnicoResponsavel || '').trim(),
    observacoes: (req.body.observacoes || '').trim(),
  }

  if (!payload.titulo || !payload.descricao || !payload.area) {
    return res.status(400).json({ message: 'Título, descrição e área são obrigatórios.' })
  }

  if (!priorityToMinutes[payload.prioridade]) {
    return res.status(400).json({ message: 'Prioridade inválida.' })
  }

  try {
    let created
    await mutateDatabase(async (db) => {
      const openedAt = nowIso()
      const dueAt = new Date(Date.now() + priorityToMinutes[payload.prioridade] * 60000).toISOString()
      const userId = req.auth?.user?.id || null
      const requester = payload.solicitante || req.auth?.user?.nome || 'Visitante'

      const ticket = {
        id: nextNumericId(db.chamados),
        numero_chamado: createTicketNumber(),
        usuario_id: userId,
        solicitante: requester,
        titulo: payload.titulo,
        descricao: payload.descricao,
        area: payload.area,
        prioridade: payload.prioridade,
        status: 'Aberto',
        tecnico_responsavel: payload.tecnico_responsavel || 'Não atribuído',
        data_abertura: openedAt,
        data_fechamento: null,
        tempo_resolucao: null,
        observacoes: payload.observacoes,
        due_at: dueAt,
      }

      db.chamados.unshift(ticket)
      db.historico.unshift({
        id: nextNumericId(db.historico),
        chamado_id: ticket.id,
        usuario_id: userId,
        acao_realizada: 'Chamado criado',
        data: openedAt,
        observacoes: payload.observacoes || 'Abertura inicial do chamado',
      })

      created = toTicketResponse(ticket)
    })

    return res.status(201).json({ message: 'Chamado aberto com sucesso.', ticket: created })
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Erro ao abrir chamado.' })
  }
})

router.use(requireAuth)

router.get('/my', async (req, res) => {
  const db = await readDatabase()
  const userId = req.auth.user.id

  const {
    month,
    year,
    status,
    priority,
    area,
    responsible,
    search,
  } = req.query

  const filtered = db.chamados
    .filter((item) => item.usuario_id === userId)
    .filter((item) => {
      if (month) {
        const currentMonth = new Date(item.data_abertura).getMonth() + 1
        if (Number(month) !== currentMonth) return false
      }
      if (year) {
        const currentYear = new Date(item.data_abertura).getFullYear()
        if (Number(year) !== currentYear) return false
      }
      if (status && status !== 'todos' && item.status !== status) return false
      if (priority && priority !== 'todos' && item.prioridade !== priority) return false
      if (area && area !== 'todos' && normalize(item.area) !== normalize(area)) return false
      if (responsible && responsible !== 'todos' && normalize(item.tecnico_responsavel) !== normalize(responsible)) return false
      if (search) {
        const haystack = `${item.numero_chamado} ${item.area} ${item.tecnico_responsavel}`.toLowerCase()
        if (!haystack.includes(String(search).toLowerCase())) return false
      }
      return true
    })

  return res.json({ tickets: filtered.map(toTicketResponse) })
})

router.patch('/:id/status', async (req, res) => {
  const ticketId = req.params.id
  const status = (req.body.status || '').trim()
  const tecnicoResponsavel = (req.body.tecnicoResponsavel || '').trim()
  const observacoes = (req.body.observacoes || '').trim()

  if (!['Aberto', 'Em andamento', 'Concluído'].includes(status)) {
    return res.status(400).json({ message: 'Status inválido.' })
  }

  try {
    let updated
    await mutateDatabase(async (db) => {
      const ticket = db.chamados.find((item) => item.id === ticketId && item.usuario_id === req.auth.user.id)
      if (!ticket) {
        throw new Error('Chamado não encontrado.')
      }

      ticket.status = status
      if (tecnicoResponsavel) {
        ticket.tecnico_responsavel = tecnicoResponsavel
      }
      if (observacoes) {
        ticket.observacoes = observacoes
      }

      if (status === 'Concluído') {
        ticket.data_fechamento = nowIso()
        ticket.tempo_resolucao = computeResolutionMinutes(ticket.data_abertura, ticket.data_fechamento)
      }

      db.historico.unshift({
        id: nextNumericId(db.historico),
        chamado_id: ticket.id,
        usuario_id: req.auth.user.id,
        acao_realizada: `Status alterado para ${status}`,
        data: nowIso(),
        observacoes: observacoes || '',
      })

      updated = toTicketResponse(ticket)
    })

    return res.json({ message: 'Status atualizado com sucesso.', ticket: updated })
  } catch (error) {
    return res.status(404).json({ message: error.message || 'Não foi possível atualizar o chamado.' })
  }
})

router.get('/dashboard/me', async (req, res) => {
  const db = await readDatabase()
  const userTickets = db.chamados.filter((item) => item.usuario_id === req.auth.user.id)

  const now = new Date()
  const month = now.getMonth()
  const year = now.getFullYear()

  const attendedThisMonth = userTickets.filter((ticket) => {
    const created = new Date(ticket.data_abertura)
    return created.getMonth() === month && created.getFullYear() === year
  }).length

  const opened = userTickets.filter((ticket) => ticket.status === 'Aberto').length
  const completed = userTickets.filter((ticket) => ticket.status === 'Concluído').length
  const pending = userTickets.filter((ticket) => ticket.status === 'Em andamento').length

  const resolutionTimes = userTickets
    .map((ticket) => ticket.tempo_resolucao)
    .filter((value) => Number.isFinite(value) && value > 0)

  const avgResolution = resolutionTimes.length
    ? Math.round(resolutionTimes.reduce((acc, item) => acc + item, 0) / resolutionTimes.length)
    : 0

  const byPriority = ['critica', 'alta', 'media', 'baixa'].map((priority) => ({
    name: priority,
    total: userTickets.filter((ticket) => ticket.prioridade === priority).length,
  }))

  const byStatus = ['Aberto', 'Em andamento', 'Concluído'].map((status) => ({
    name: status,
    total: userTickets.filter((ticket) => ticket.status === status).length,
  }))

  const areas = [...new Set(userTickets.map((ticket) => ticket.area))]
  const byArea = areas.map((areaName) => ({
    name: areaName,
    total: userTickets.filter((ticket) => ticket.area === areaName).length,
  }))

  const monthMap = new Map()
  userTickets.forEach((ticket) => {
    const date = new Date(ticket.data_abertura)
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    monthMap.set(key, (monthMap.get(key) || 0) + 1)
  })

  const byMonth = [...monthMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, total]) => ({ name: key, total }))

  return res.json({
    indicators: {
      attendedThisMonth,
      opened,
      completed,
      pending,
      avgResolution,
      highPriority: byPriority.find((item) => item.name === 'alta')?.total || 0,
      mediumPriority: byPriority.find((item) => item.name === 'media')?.total || 0,
      lowPriority: byPriority.find((item) => item.name === 'baixa')?.total || 0,
    },
    charts: {
      byMonth,
      byPriority,
      byStatus,
      byArea,
    },
  })
})

router.get('/history/actions', async (req, res) => {
  const db = await readDatabase()
  const actions = db.historico.filter((item) => item.usuario_id === req.auth.user.id)
  return res.json({ actions })
})

export default router
