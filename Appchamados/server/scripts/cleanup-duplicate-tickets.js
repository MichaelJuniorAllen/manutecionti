import 'dotenv/config'
import { mutateDatabase, readDatabase } from '../services/database.js'

const DEFAULT_WINDOW_MINUTES = 10

function normalize(value = '') {
  return String(value || '').trim().toLowerCase()
}

function toMs(value) {
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) ? parsed : 0
}

function parseArgs(argv) {
  const args = new Set(argv)
  const apply = args.has('--apply')
  const dryRun = !apply
  const modeArg = argv.find((item) => item.startsWith('--mode='))
  const modeValue = String(modeArg?.split('=')[1] || 'safe').trim().toLowerCase()
  const mode = modeValue === 'aggressive' ? 'aggressive' : 'safe'
  const windowArg = argv.find((item) => item.startsWith('--window-minutes='))
  const parsedWindow = Number(windowArg?.split('=')[1])
  const windowMinutes = Number.isFinite(parsedWindow) && parsedWindow > 0
    ? parsedWindow
    : DEFAULT_WINDOW_MINUTES

  return {
    apply,
    dryRun,
    mode,
    windowMinutes,
  }
}

function buildFingerprint(ticket) {
  return [
    normalize(ticket?.usuario_id),
    normalize(ticket?.solicitante),
    normalize(ticket?.titulo),
    normalize(ticket?.descricao),
    normalize(ticket?.area),
    normalize(ticket?.tecnico_responsavel),
    normalize(ticket?.prioridade),
  ].join('|')
}

function isSafeCandidate(ticket, historyCount, historyEntries, attendanceCount, mode) {
  if (mode === 'aggressive') {
    if (!ticket) return false
    if (ticket.status === 'Concluído') return false
    return true
  }

  if (!ticket || ticket.status !== 'Aberto') return false
  if (attendanceCount > 0) return false
  if (historyCount > 1) return false

  if (historyEntries.length === 0) {
    return true
  }

  return historyEntries.every((entry) => normalize(entry?.acao_realizada) === normalize('Chamado criado'))
}

function buildDuplicatePlan(db, windowMinutes, mode = 'safe') {
  const windowMs = Math.max(1, Number(windowMinutes)) * 60 * 1000
  const attendances = Array.isArray(db?.atendimentos) ? db.atendimentos : []
  const history = Array.isArray(db?.historico) ? db.historico : []
  const tickets = Array.isArray(db?.chamados) ? db.chamados : []

  const attendanceCountByTicketId = new Map()
  for (const item of attendances) {
    const id = String(item?.chamado_id || '')
    if (!id) continue
    attendanceCountByTicketId.set(id, (attendanceCountByTicketId.get(id) || 0) + 1)
  }

  const historyByTicketId = new Map()
  for (const item of history) {
    const id = String(item?.chamado_id || '')
    if (!id) continue
    const list = historyByTicketId.get(id)
    if (list) {
      list.push(item)
    } else {
      historyByTicketId.set(id, [item])
    }
  }

  const candidates = tickets
    .filter((ticket) => {
      const id = String(ticket?.id || '')
      const ticketHistory = historyByTicketId.get(id) || []
      const ticketAttendanceCount = attendanceCountByTicketId.get(id) || 0
      return isSafeCandidate(ticket, ticketHistory.length, ticketHistory, ticketAttendanceCount, mode)
    })
    .sort((left, right) => {
      const diff = toMs(left?.data_abertura) - toMs(right?.data_abertura)
      if (diff !== 0) return diff
      return String(left?.id || '').localeCompare(String(right?.id || ''))
    })

  const groupsByFingerprint = new Map()
  const duplicates = []

  for (const ticket of candidates) {
    const fingerprint = buildFingerprint(ticket)
    const openedAtMs = toMs(ticket?.data_abertura)
    const groups = groupsByFingerprint.get(fingerprint) || []

    let matchedPrimary = null
    for (let index = groups.length - 1; index >= 0; index -= 1) {
      const current = groups[index]
      if (openedAtMs - current.openedAtMs <= windowMs) {
        matchedPrimary = current
        break
      }
    }

    if (!matchedPrimary) {
      groups.push({
        primaryId: String(ticket.id),
        openedAtMs,
      })
      groupsByFingerprint.set(fingerprint, groups)
      continue
    }

    duplicates.push({
      removeId: String(ticket.id),
      keepId: matchedPrimary.primaryId,
    })
  }

  return duplicates
}

function applyPlan(db, plan) {
  const removeMap = new Map(plan.map((item) => [String(item.removeId), String(item.keepId)]))
  if (removeMap.size === 0) {
    return {
      removedTickets: 0,
      removedHistory: 0,
      reassignedHistory: 0,
      reassignedAttendances: 0,
    }
  }

  const removedTicketIds = new Set(removeMap.keys())
  const chamados = Array.isArray(db.chamados) ? db.chamados : []
  const historico = Array.isArray(db.historico) ? db.historico : []
  const atendimentos = Array.isArray(db.atendimentos) ? db.atendimentos : []

  let removedHistory = 0
  let reassignedHistory = 0
  let reassignedAttendances = 0

  db.chamados = chamados.filter((ticket) => !removedTicketIds.has(String(ticket?.id || '')))

  db.historico = historico.filter((entry) => {
    const ticketId = String(entry?.chamado_id || '')
    if (!removedTicketIds.has(ticketId)) {
      return true
    }

    const keepId = removeMap.get(ticketId)
    const action = normalize(entry?.acao_realizada)
    const isCreatedAction = action === normalize('Chamado criado')

    if (isCreatedAction) {
      removedHistory += 1
      return false
    }

    entry.chamado_id = keepId
    reassignedHistory += 1
    return true
  })

  for (const entry of atendimentos) {
    const ticketId = String(entry?.chamado_id || '')
    if (!removedTicketIds.has(ticketId)) {
      continue
    }

    entry.chamado_id = removeMap.get(ticketId)
    reassignedAttendances += 1
  }

  return {
    removedTickets: removedTicketIds.size,
    removedHistory,
    reassignedHistory,
    reassignedAttendances,
  }
}

async function run() {
  const options = parseArgs(process.argv.slice(2))

  if (options.dryRun) {
    const db = await readDatabase()
    const plan = buildDuplicatePlan(db, options.windowMinutes, options.mode)

    console.log(`[DRY-RUN] Modo: ${options.mode}`)
    console.log(`[DRY-RUN] Janela: ${options.windowMinutes} minutos`)
    console.log(`[DRY-RUN] Duplicados elegíveis encontrados: ${plan.length}`)

    if (plan.length > 0) {
      for (const item of plan.slice(0, 25)) {
        console.log(`- remover chamado ${item.removeId} e manter ${item.keepId}`)
      }
      if (plan.length > 25) {
        console.log(`... e mais ${plan.length - 25} registros`)
      }
    }

    console.log('[DRY-RUN] Nenhuma alteração foi aplicada. Use --apply para executar a limpeza.')
    return
  }

  let summary = null
  await mutateDatabase(async (db) => {
    const plan = buildDuplicatePlan(db, options.windowMinutes, options.mode)
    const stats = applyPlan(db, plan)
    summary = {
      mode: options.mode,
      windowMinutes: options.windowMinutes,
      plannedDuplicates: plan.length,
      ...stats,
    }
  })

  console.log(`[APPLY] Modo: ${summary.mode}`)
  console.log(`[APPLY] Janela: ${summary.windowMinutes} minutos`)
  console.log(`[APPLY] Duplicados tratados: ${summary.plannedDuplicates}`)
  console.log(`[APPLY] Chamados removidos: ${summary.removedTickets}`)
  console.log(`[APPLY] Histórico removido (ações de criação duplicadas): ${summary.removedHistory}`)
  console.log(`[APPLY] Histórico reatribuído: ${summary.reassignedHistory}`)
  console.log(`[APPLY] Atendimentos reatribuídos: ${summary.reassignedAttendances}`)
}

run().catch((error) => {
  console.error('Falha na limpeza de chamados duplicados:', error.message)
  process.exit(1)
})
