import express from 'express'
import { optionalAuth, requireAuth } from '../middleware/auth.js'
import { verifyToken } from '../services/auth.js'
import { createTicketNumber, mutateDatabase, nextNumericId, nowIso, readDatabase } from '../services/database.js'

const router = express.Router()

const priorityToMinutes = {
  critica: 20,
  alta: 60,
  media: 180,
  baixa: 1440,
}

const ALLOWED_TICKET_EMAILS = new Set([
  'scihupacentral@maoamigacaxias.org.br',
  'nutricionistaupacentral@maoamigacaxias.org.br',
  'coordadmupacentral@maoamigacaxias.org.br',
  'coordinfraestruraupacentral@maoamigacaxias.org.br',
  'educacaocontinuadaupacentral@maoamigacaxias.org.br',
  'farmaceuticaclinicaupacentral@maoamigacaxias.org.br',
  'coordfarmaciaupacentral@maoamigacaxias.org.br',
  'diretorclinicoupacentral@maoamigacaxias.org.br',
  'coordmedicoupacentral@maoamigacaxias.org.br',
  'faturamentoupacentral@maoamigacaxias.org.br',
  'tiupacentral@maoamigacaxias.org.br',
  'manutencaoupacentral@maoamigacaxias.org.br',
  'sesmtupacentral@maoamigacaxias.org.br',
  'assistentesocialupacentral@maoamigacaxias.org.br',
  'recpcaoupacentral@maoamigacaxias.org.br',
  'enfermagemupacentral@maoamigacaxias.org.br',
  'odontologiaupacentral@maoamigacaxias.org.br',
  'coordenfermagemupacentral@maoamigacaxias.org.br',
])

const TEAM_RESPONSIBLE_OPTIONS = new Set([
  'ti',
  'manutenção',
  'engenharia clínica',
])

const VALID_TICKET_STATUSES = ['Aberto', 'Em andamento', 'Aguardando Continuação', 'Concluído']
const PAUSE_REASONS = new Set([
  'Final do expediente',
  'Aguardando peça',
  'Aguardando autorização',
  'Aguardando outro setor',
  'Necessita outro técnico',
  'Outro',
])

const streamClients = new Set()
const TEN_MINUTES_MS = 10 * 60 * 1000
let reminderLoopInitialized = false
let reminderLoopBusy = false

function normalize(value = '') {
  return value.trim().toLowerCase()
}

function isTeamResponsible(value = '') {
  return TEAM_RESPONSIBLE_OPTIONS.has(normalize(value))
}

function computeResolutionMinutes(startIso, endIso) {
  if (!startIso || !endIso) return null
  const start = new Date(startIso).getTime()
  const end = new Date(endIso).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null
  return Math.round((end - start) / 60000)
}

function getTicketTotalResolutionMinutes(ticket) {
  if (!ticket?.data_fechamento) return null
  return computeResolutionMinutes(ticket.data_abertura, ticket.data_fechamento)
}

function getTicketInProgressMinutes(ticket) {
  if (Number.isFinite(Number(ticket?.tempo_andamento))) {
    return Number(ticket.tempo_andamento)
  }

  if (!ticket?.data_atendimento) return null

  const endIso = ticket?.data_fechamento || nowIso()
  return computeResolutionMinutes(ticket.data_atendimento, endIso)
}

function ensureAttendancesCollection(db) {
  if (!Array.isArray(db.atendimentos)) {
    db.atendimentos = []
  }
}

function getTicketSessions(db, ticketId) {
  ensureAttendancesCollection(db)
  return db.atendimentos
    .filter((item) => String(item.chamado_id) === String(ticketId))
    .sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime())
}

function getActiveSession(db, ticketId) {
  const sessions = getTicketSessions(db, ticketId)
  return [...sessions].reverse().find((session) => !session.fim && session.status === 'Em andamento') || null
}

function computeSessionWorkedMinutes(session, fallbackEndIso = null) {
  if (Number.isFinite(Number(session?.tempo_trabalhado))) {
    return Number(session.tempo_trabalhado)
  }

  const endIso = session?.fim || fallbackEndIso
  return computeResolutionMinutes(session?.inicio, endIso)
}

function closeSession(session, { endIso, status, motivoPausa = '', observacao = '' }) {
  session.fim = endIso
  session.status = status
  session.motivo_pausa = motivoPausa || null
  session.observacao = observacao || session.observacao || null
  session.tempo_trabalhado = computeSessionWorkedMinutes(session, endIso)
  session.updated_at = endIso
}

function toSessionResponse(session) {
  return {
    id: session.id,
    chamadoId: session.chamado_id,
    tecnicoId: session.id_tecnico,
    tecnicoNome: session.nome_tecnico,
    inicio: session.inicio,
    fim: session.fim || null,
    tempoTrabalhado: Number.isFinite(Number(session.tempo_trabalhado)) ? Number(session.tempo_trabalhado) : null,
    motivoPausa: session.motivo_pausa || null,
    observacao: session.observacao || null,
    status: session.status || 'Em andamento',
    tipoInicio: session.tipo_inicio || 'Iniciado',
    createdAt: session.created_at || null,
    updatedAt: session.updated_at || null,
  }
}

function getSessionActionLabel(session) {
  if (!session) return '--'
  if (session.status === 'Concluído') return 'Concluiu'
  if (session.status === 'Pausado') return 'Pausou'
  if (session.status === 'Em andamento') {
    return session.tipo_inicio === 'Retomado' ? 'Retomou' : 'Iniciou'
  }
  return session.status
}

function recomputeTicketTimesFromSessions(db, ticket) {
  const sessions = getTicketSessions(db, ticket.id)
  const now = nowIso()

  const totalWorked = sessions.reduce((acc, session) => {
    const minutes = computeSessionWorkedMinutes(session)
    return Number.isFinite(minutes) && minutes >= 0 ? acc + minutes : acc
  }, 0)

  const activeSession = getActiveSession(db, ticket.id)
  const inProgressMinutes = activeSession
    ? computeSessionWorkedMinutes(activeSession, now)
    : null

  ticket.tempo_resolucao = totalWorked > 0 ? totalWorked : ticket.tempo_resolucao
  ticket.tempo_andamento = Number.isFinite(inProgressMinutes) ? inProgressMinutes : null
}

function createHttpError(statusCode, message) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

function sendStreamEvent(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`)
}

function broadcastTicketEvent(payload) {
  for (const client of streamClients) {
    try {
      sendStreamEvent(client.res, payload)
    } catch {
      streamClients.delete(client)
    }
  }
}

async function broadcastReminderEvents() {
  if (reminderLoopBusy || streamClients.size === 0) {
    return
  }

  reminderLoopBusy = true

  try {
    const db = await readDatabase()
    const openTickets = db.chamados.filter((ticket) => ticket.status !== 'Concluído')
    const openTicketIds = new Set(openTickets.map((ticket) => String(ticket.id)))
    const now = Date.now()

    for (const client of streamClients) {
      for (const ticketId of [...client.reminderTimestamps.keys()]) {
        if (!openTicketIds.has(ticketId)) {
          client.reminderTimestamps.delete(ticketId)
        }
      }

      for (const ticket of openTickets) {
        const id = String(ticket.id)
        const previousReminderAt = client.reminderTimestamps.get(id)

        if (!Number.isFinite(previousReminderAt)) {
          client.reminderTimestamps.set(id, now)
          continue
        }

        if (now - previousReminderAt < TEN_MINUTES_MS) {
          continue
        }

        sendStreamEvent(client.res, {
          type: 'ticket-reminder',
          ticket: toTicketResponse(ticket, db),
          timestamp: nowIso(),
        })

        client.reminderTimestamps.set(id, now)
      }
    }
  } catch {
    // Mantém o stream ativo mesmo em falhas pontuais de leitura.
  } finally {
    reminderLoopBusy = false
  }
}

function ensureReminderLoop() {
  if (reminderLoopInitialized) {
    return
  }

  reminderLoopInitialized = true
  setInterval(() => {
    broadcastReminderEvents()
  }, 30000)
}

async function resolveUserFromStreamToken(token) {
  const payload = verifyToken(token)
  const db = await readDatabase()
  const user = db.usuarios.find((item) => item.id === payload.sub)
  if (!user) {
    throw new Error('Usuário não encontrado para esta sessão.')
  }
  return user
}

function toTicketResponse(ticket, db = null) {
  const totalResolution = getTicketTotalResolutionMinutes(ticket)
  const inProgressResolution = getTicketInProgressMinutes(ticket)
  const sessions = db ? getTicketSessions(db, ticket.id) : []
  const mappedSessions = sessions.map((session) => {
    const parsed = toSessionResponse(session)
    if (!parsed.fim) {
      const liveWorked = computeSessionWorkedMinutes(session, nowIso())
      if (Number.isFinite(liveWorked) && liveWorked >= 0) {
        parsed.tempoTrabalhado = liveWorked
      }
    }
    return parsed
  })
  const lastSession = mappedSessions.length ? mappedSessions[mappedSessions.length - 1] : null
  const activeSession = [...sessions].reverse().find((session) => !session.fim && session.status === 'Em andamento') || null
  const inProgressFromSessions = activeSession ? computeSessionWorkedMinutes(activeSession, nowIso()) : null
  const totalWorkedFromSessions = mappedSessions.reduce((acc, item) => {
    return Number.isFinite(item.tempoTrabalhado) ? acc + item.tempoTrabalhado : acc
  }, 0)

  return {
    id: ticket.id,
    numeroChamado: ticket.numero_chamado,
    dataAbertura: ticket.data_abertura,
    area: ticket.area,
    prioridade: ticket.prioridade,
    status: ticket.status,
    tecnicoResponsavel: ticket.tecnico_responsavel,
    dataFechamento: ticket.data_fechamento,
    tempoResolucao: totalWorkedFromSessions > 0 ? totalWorkedFromSessions : totalResolution,
    tempoAndamento: Number.isFinite(inProgressFromSessions) ? inProgressFromSessions : inProgressResolution,
    observacoes: ticket.observacoes,
    solicitante: ticket.solicitante,
    titulo: ticket.titulo,
    descricao: ticket.descricao,
    dueAt: ticket.due_at,
    atendenteId: ticket.atendente_id || null,
    atendenteNome: ticket.atendente_nome || null,
    atendenteFotoPerfil: ticket.atendente_foto_perfil || null,
    dataAtendimento: ticket.data_atendimento || null,
    sessoes: mappedSessions,
    totalSessoes: mappedSessions.length,
    tempoTotalSessoes: totalWorkedFromSessions,
    ultimaAcaoSessao: getSessionActionLabel(lastSession),
    ultimaSessao: lastSession,
  }
}

router.post('/', optionalAuth, async (req, res) => {
  const payload = {
    titulo: (req.body.titulo || '').trim(),
    descricao: (req.body.descricao || '').trim(),
    area: (req.body.area || '').trim(),
    solicitante: (req.body.solicitante || '').trim(),
    email_corporativo: normalize(req.body.emailCorporativo || ''),
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
        email_corporativo: payload.email_corporativo,
        prioridade: payload.prioridade,
        status: 'Aberto',
        tecnico_responsavel: payload.tecnico_responsavel || 'Não atribuído',
        data_abertura: openedAt,
        data_fechamento: null,
        tempo_resolucao: null,
        tempo_andamento: null,
        observacoes: payload.observacoes,
        due_at: dueAt,
        atendente_id: null,
        atendente_nome: null,
        atendente_foto_perfil: null,
        data_atendimento: null,
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

      created = toTicketResponse(ticket, db)
    })

    broadcastTicketEvent({
      type: 'ticket-created',
      ticketId: created?.id || null,
      timestamp: nowIso(),
    })

    return res.status(201).json({ message: 'Chamado aberto com sucesso.', ticket: created })
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Erro ao abrir chamado.' })
  }
})

router.get('/stream', async (req, res) => {
  const queryToken = typeof req.query.token === 'string' ? req.query.token : ''
  const authHeader = req.headers.authorization || ''
  const headerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  const token = queryToken || headerToken

  if (!token) {
    return res.status(401).json({ message: 'Sessão inválida. Faça login novamente.' })
  }

  let user
  try {
    user = await resolveUserFromStreamToken(token)
  } catch {
    return res.status(401).json({ message: 'Token expirado ou inválido.' })
  }

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders?.()

  sendStreamEvent(res, { type: 'connected', timestamp: nowIso() })
  const client = {
    res,
    userId: user.id,
    reminderTimestamps: new Map(),
  }

  streamClients.add(client)
  ensureReminderLoop()

  const keepAlive = setInterval(() => {
    try {
      res.write(': ping\n\n')
    } catch {
      clearInterval(keepAlive)
      streamClients.delete(client)
    }
  }, 25000)

  req.on('close', () => {
    clearInterval(keepAlive)
    streamClients.delete(client)
  })

  return undefined
})

router.use(requireAuth)

router.get('/my', async (req, res) => {
  const db = await readDatabase()
  ensureAttendancesCollection(db)

  const {
    day,
    month,
    year,
    status,
    priority,
    area,
    responsible,
    search,
    lastAction,
    pauseReason,
  } = req.query

  const filtered = db.chamados
    .filter((item) => {
      const openedAt = new Date(item.data_abertura)
      if (Number.isNaN(openedAt.getTime())) return false

      const dayNumber = Number(day)
      const monthNumber = Number(month)
      const yearNumber = Number(year)

      const hasDay = Number.isFinite(dayNumber) && dayNumber >= 1 && dayNumber <= 31
      const hasMonth = Number.isFinite(monthNumber) && monthNumber >= 1 && monthNumber <= 12
      const hasYear = Number.isFinite(yearNumber) && yearNumber >= 1900

      if (hasDay && openedAt.getDate() !== dayNumber) return false
      if (hasMonth && openedAt.getMonth() + 1 !== monthNumber) return false
      if (hasYear && openedAt.getFullYear() !== yearNumber) return false

      if (status && status !== 'todos' && item.status !== status) return false
      if (priority && priority !== 'todos' && item.prioridade !== priority) return false
      if (area && area !== 'todos' && normalize(item.area) !== normalize(area)) return false
      if (responsible && responsible !== 'todos' && normalize(item.tecnico_responsavel) !== normalize(responsible)) return false

      const sessions = getTicketSessions(db, item.id)
      const lastSession = sessions.length ? sessions[sessions.length - 1] : null

      if (lastAction && lastAction !== 'todos') {
        const action = getSessionActionLabel(lastSession)
        if (normalize(action) !== normalize(String(lastAction))) return false
      }

      if (pauseReason && pauseReason !== 'todos') {
        const hasPauseReason = sessions.some((session) => normalize(session?.motivo_pausa || '') === normalize(String(pauseReason)))
        if (!hasPauseReason) return false
      }

      if (search) {
        const haystack = `${item.numero_chamado} ${item.area} ${item.tecnico_responsavel}`.toLowerCase()
        if (!haystack.includes(String(search).toLowerCase())) return false
      }
      return true
    })

  return res.json({ tickets: filtered.map((ticket) => toTicketResponse(ticket, db)) })
})

router.patch('/:id/status', async (req, res) => {
  const ticketId = req.params.id
  const status = (req.body.status || '').trim()
  const tecnicoResponsavel = (req.body.tecnicoResponsavel || '').trim()
  const observacoes = (req.body.observacoes || '').trim()
  const motivoPausa = (req.body.motivoPausa || '').trim()
  const observacaoSessao = (req.body.observacaoSessao || '').trim()

  if (!VALID_TICKET_STATUSES.includes(status)) {
    return res.status(400).json({ message: 'Status inválido.' })
  }

  try {
    let updated
    await mutateDatabase(async (db) => {
      ensureAttendancesCollection(db)
      const ticket = db.chamados.find((item) => item.id === ticketId)
      if (!ticket) {
        throw createHttpError(404, 'Chamado não encontrado.')
      }

      const now = nowIso()
      const previousStatus = ticket.status
      let sessionActionMessage = ''

      function ensureActiveSessionForCurrentAttendant() {
        let activeSession = getActiveSession(db, ticket.id)
        if (activeSession) {
          return activeSession
        }

        // Compatibilidade com chamados antigos sem sessão persistida.
        if (ticket.atendente_id && ticket.data_atendimento) {
          const recoveredSession = {
            id: nextNumericId(db.atendimentos),
            chamado_id: ticket.id,
            id_tecnico: ticket.atendente_id,
            nome_tecnico: ticket.atendente_nome || ticket.tecnico_responsavel || 'Técnico',
            inicio: ticket.data_atendimento,
            fim: null,
            tempo_trabalhado: null,
            motivo_pausa: null,
            observacao: null,
            status: 'Em andamento',
            tipo_inicio: 'Iniciado',
            created_at: now,
            updated_at: now,
          }

          db.atendimentos.push(recoveredSession)
          return recoveredSession
        }

        return null
      }

      if (status === 'Em andamento') {
        if (ticket.atendente_id && ticket.atendente_id !== req.auth.user.id) {
          throw createHttpError(403, `Este chamado já está sendo atendido por ${ticket.atendente_nome || 'outro usuário'}.`)
        }

        const activeSession = getActiveSession(db, ticket.id)
        if (activeSession && String(activeSession.id_tecnico) !== String(req.auth.user.id)) {
          throw createHttpError(403, `Este chamado já está sendo atendido por ${activeSession.nome_tecnico || 'outro usuário'}.`)
        }

        if (!activeSession) {
          const tipoInicio = previousStatus === 'Aguardando Continuação' ? 'Retomado' : 'Iniciado'
          db.atendimentos.push({
            id: nextNumericId(db.atendimentos),
            chamado_id: ticket.id,
            id_tecnico: req.auth.user.id,
            nome_tecnico: req.auth.user.nome,
            inicio: now,
            fim: null,
            tempo_trabalhado: null,
            motivo_pausa: null,
            observacao: observacaoSessao || null,
            status: 'Em andamento',
            tipo_inicio: tipoInicio,
            created_at: now,
            updated_at: now,
          })

          sessionActionMessage = tipoInicio === 'Retomado'
            ? `${req.auth.user.nome} retomou o atendimento`
            : `${req.auth.user.nome} iniciou o atendimento`
        }

        ticket.atendente_id = req.auth.user.id
        ticket.atendente_nome = req.auth.user.nome
        ticket.atendente_foto_perfil = req.auth.user.foto_perfil || null
        ticket.data_atendimento = ticket.data_atendimento || now
        ticket.status = 'Em andamento'
      }

      if (status === 'Aguardando Continuação') {
        if (previousStatus !== 'Em andamento') {
          throw createHttpError(400, 'Somente chamados em andamento podem ser pausados.')
        }

        if (!PAUSE_REASONS.has(motivoPausa)) {
          throw createHttpError(400, 'Informe um motivo de pausa válido.')
        }

        if (!observacaoSessao) {
          throw createHttpError(400, 'Informe a observação da pausa.')
        }

        if (ticket.atendente_id && String(ticket.atendente_id) !== String(req.auth.user.id)) {
          throw createHttpError(403, `Apenas ${ticket.atendente_nome || 'o atendente responsável'} pode pausar este chamado.`)
        }

        const activeSession = ensureActiveSessionForCurrentAttendant()
        if (!activeSession) {
          throw createHttpError(400, 'Não existe sessão ativa para pausar este chamado.')
        }

        if (String(activeSession.id_tecnico) !== String(req.auth.user.id)) {
          throw createHttpError(403, `Apenas ${activeSession.nome_tecnico || 'o atendente responsável'} pode pausar este chamado.`)
        }

        closeSession(activeSession, {
          endIso: now,
          status: 'Pausado',
          motivoPausa,
          observacao: observacaoSessao,
        })

        ticket.status = 'Aguardando Continuação'
        ticket.atendente_id = null
        ticket.atendente_nome = null
        ticket.atendente_foto_perfil = null
        sessionActionMessage = `${req.auth.user.nome} pausou o atendimento`
      }

      if (status === 'Concluído') {
        if (previousStatus !== 'Em andamento') {
          throw createHttpError(400, 'Somente chamados em andamento podem ser concluídos.')
        }

        if (ticket.atendente_id && String(ticket.atendente_id) !== String(req.auth.user.id)) {
          throw createHttpError(403, `Apenas ${ticket.atendente_nome || 'o atendente responsável'} pode concluir este chamado.`)
        }

        const activeSession = ensureActiveSessionForCurrentAttendant()
        if (!activeSession) {
          throw createHttpError(400, 'Não existe sessão ativa para concluir este chamado.')
        }

        if (String(activeSession.id_tecnico) !== String(req.auth.user.id)) {
          throw createHttpError(403, `Apenas ${activeSession.nome_tecnico || 'o atendente responsável'} pode concluir este chamado.`)
        }

        closeSession(activeSession, {
          endIso: now,
          status: 'Concluído',
          observacao: observacaoSessao || observacoes,
        })

        ticket.status = 'Concluído'
        ticket.data_fechamento = now
        ticket.atendente_id = req.auth.user.id
        ticket.atendente_nome = req.auth.user.nome
        ticket.atendente_foto_perfil = req.auth.user.foto_perfil || null
        sessionActionMessage = `${req.auth.user.nome} concluiu o atendimento`
      }

      if (status === 'Aberto') {
        ticket.status = 'Aberto'
      }

      if (tecnicoResponsavel) {
        ticket.tecnico_responsavel = tecnicoResponsavel
      }
      if (observacoes) {
        ticket.observacoes = observacoes
      }

      if (status === 'Concluído') {
        ticket.data_fechamento = ticket.data_fechamento || now
      }

      recomputeTicketTimesFromSessions(db, ticket)

      db.historico.unshift({
        id: nextNumericId(db.historico),
        chamado_id: ticket.id,
        usuario_id: req.auth.user.id,
        acao_realizada: sessionActionMessage || `Status alterado para ${ticket.status}`,
        data: now,
        observacoes: observacaoSessao || observacoes || '',
      })

      updated = toTicketResponse(ticket, db)
    })

    broadcastTicketEvent({
      type: 'ticket-updated',
      ticketId: updated?.id || ticketId,
      status: updated?.status || status,
      timestamp: nowIso(),
    })

    return res.json({ message: 'Status atualizado com sucesso.', ticket: updated })
  } catch (error) {
    return res.status(error.statusCode || 400).json({ message: error.message || 'Não foi possível atualizar o chamado.' })
  }
})

router.get('/dashboard/me', async (req, res) => {
  const db = await readDatabase()
  ensureAttendancesCollection(db)
  const userTickets = db.chamados.filter((item) => item.usuario_id === req.auth.user.id)
  const technicianSessions = db.atendimentos.filter((item) => String(item.id_tecnico) === String(req.auth.user.id))

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
    .map((ticket) => getTicketTotalResolutionMinutes(ticket))
    .filter((value) => Number.isFinite(value) && value > 0)

  const avgResolution = resolutionTimes.length
    ? Math.round(resolutionTimes.reduce((acc, item) => acc + item, 0) / resolutionTimes.length)
    : 0

  const sessionsStarted = technicianSessions.length
  const sessionsPaused = technicianSessions.filter((item) => item.status === 'Pausado').length
  const sessionsCompleted = technicianSessions.filter((item) => item.status === 'Concluído').length
  const sessionsResumed = technicianSessions.filter((item) => item.tipo_inicio === 'Retomado').length
  const workedMinutes = technicianSessions.reduce((acc, item) => {
    const minutes = Number(item.tempo_trabalhado)
    return Number.isFinite(minutes) && minutes > 0 ? acc + minutes : acc
  }, 0)
  const avgSessionMinutes = sessionsCompleted > 0 ? Math.round(workedMinutes / sessionsCompleted) : 0

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
      sessionsStarted,
      sessionsCompleted,
      sessionsPaused,
      sessionsResumed,
      workedMinutes,
      avgSessionMinutes,
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
