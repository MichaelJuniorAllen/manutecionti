import 'dotenv/config'
import fs from 'node:fs/promises'
import path from 'node:path'
import pg from 'pg'

const { Pool } = pg
const DATABASE_URL = process.env.DATABASE_URL
const DATA_FILE = path.resolve(process.cwd(), 'server', 'data', 'database.json')

const defaultDatabase = {
  usuarios: [],
  chamados: [],
  historico: [],
  configuracoes: {},
}

function normalizeDatabaseShape(data) {
  const normalized = data && typeof data === 'object' ? data : {}

  for (const [key, fallback] of Object.entries(defaultDatabase)) {
    if (!(key in normalized)) {
      normalized[key] = Array.isArray(fallback) ? [] : {}
    }
  }

  return normalized
}

async function readJsonDatabase() {
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf-8')
    return normalizeDatabaseShape(JSON.parse(raw))
  } catch {
    return defaultDatabase
  }
}

async function run() {
  if (!DATABASE_URL) {
    throw new Error('Defina DATABASE_URL antes de executar a migração.')
  }

  const forceSsl = String(process.env.PGSSL || 'true').toLowerCase() !== 'false'
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: forceSsl ? { rejectUnauthorized: false } : false,
  })

  const jsonData = await readJsonDatabase()

  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_state (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  await pool.query(
    `
      INSERT INTO app_state (id, data)
      VALUES ($1, $2::jsonb)
      ON CONFLICT (id)
      DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
    `,
    ['main', JSON.stringify(jsonData)],
  )

  await pool.end()
  console.log('Migração concluída: JSON local copiado para PostgreSQL com sucesso.')
}

run().catch((error) => {
  console.error('Falha na migração:', error.message)
  process.exit(1)
})
