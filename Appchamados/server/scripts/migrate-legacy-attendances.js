import 'dotenv/config'
import { mutateDatabase, nextNumericId, nowIso } from '../services/database.js'

function computeMinutes(startIso, endIso) {
  if (!startIso || !endIso) return null
  const start = new Date(startIso).getTime()
  const end = new Date(endIso).getTime()

  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return null
  }

  return Math.round((end - start) / 60000)
}

function shouldCreateLegacySession(ticket) {
  return Boolean(
    ticket?.data_atendimento
    || ticket?.atendente_id
    || ticket?.atendente_nome
    || ticket?.status === 'Em andamento'
    || ticket?.status === 'Concluído'
  )
}

async function run() {
  let createdSessions = 0

  await mutateDatabase(async (db) => {
    if (!Array.isArray(db.atendimentos)) {
      db.atendimentos = []
    }

    for (const ticket of db.chamados || []) {
      const existing = db.atendimentos.filter((item) => String(item.chamado_id) === String(ticket.id))
      if (existing.length > 0) {
        continue
      }

      if (!shouldCreateLegacySession(ticket)) {
        continue
      }

      const startAt = ticket.data_atendimento || ticket.data_abertura || nowIso()
      const endAt = ticket.status === 'Concluído' ? (ticket.data_fechamento || startAt) : null
      const workedMinutes = endAt
        ? computeMinutes(startAt, endAt)
        : (Number.isFinite(Number(ticket.tempo_andamento)) ? Number(ticket.tempo_andamento) : null)

      db.atendimentos.push({
        id: nextNumericId(db.atendimentos),
        chamado_id: ticket.id,
        id_tecnico: ticket.atendente_id || ticket.usuario_id || null,
        nome_tecnico: ticket.atendente_nome || ticket.tecnico_responsavel || 'Técnico legado',
        inicio: startAt,
        fim: endAt,
        tempo_trabalhado: Number.isFinite(workedMinutes) && workedMinutes >= 0 ? workedMinutes : null,
        motivo_pausa: null,
        observacao: 'Sessão retroativa criada por migração.',
        status: ticket.status === 'Concluído' ? 'Concluído' : 'Em andamento',
        tipo_inicio: 'Iniciado',
        created_at: nowIso(),
        updated_at: nowIso(),
      })

      createdSessions += 1
    }
  })

  console.log(`Migração concluída. Sessões retroativas criadas: ${createdSessions}`)
}

run().catch((error) => {
  console.error('Falha na migração retroativa de atendimentos:', error.message)
  process.exit(1)
})
