import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { URL } from 'node:url'
import pg from 'pg'

const DATA_DIR = path.resolve(process.cwd(), 'server', 'data')
const DB_PATH = path.join(DATA_DIR, 'database.json')
const STATE_ROW_ID = 'main'

const defaultDatabase = {
  usuarios: [],
  chamados: [],
  historico: [],
  configuracoes: {},
}

const usingPostgres = Boolean(process.env.DATABASE_URL)

let pool = null
if (usingPostgres) {
  const { Pool } = pg
  const forceSsl = String(process.env.PGSSL || 'true').toLowerCase() !== 'false'

  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: forceSsl ? { rejectUnauthorized: false } : false,
  })
}

function cloneDefaultDatabase() {
  return {
    usuarios: [],
    chamados: [],
    historico: [],
    configuracoes: {},
  }
}

function normalizeDatabaseShape(db) {
  const normalized = db && typeof db === 'object' ? db : {}
  let shouldPersist = false

  for (const [key, fallback] of Object.entries(defaultDatabase)) {
    if (!(key in normalized)) {
      normalized[key] = Array.isArray(fallback) ? [] : {}
      shouldPersist = true
    }
  }

  return { normalized, shouldPersist }
}

async function ensurePostgresDatabase() {
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
      ON CONFLICT (id) DO NOTHING
    `,
    [STATE_ROW_ID, JSON.stringify(cloneDefaultDatabase())],
  )

  const current = await pool.query('SELECT data FROM app_state WHERE id = $1', [STATE_ROW_ID])
  const data = current.rows[0]?.data || cloneDefaultDatabase()
  const { normalized, shouldPersist } = normalizeDatabaseShape(data)

  if (shouldPersist) {
    await pool.query('UPDATE app_state SET data = $2::jsonb, updated_at = NOW() WHERE id = $1', [
      STATE_ROW_ID,
      JSON.stringify(normalized),
    ])
  }

  return normalized
}

async function readPostgresDatabase() {
  const result = await pool.query('SELECT data FROM app_state WHERE id = $1', [STATE_ROW_ID])
  const data = result.rows[0]?.data || cloneDefaultDatabase()
  const { normalized } = normalizeDatabaseShape(data)
  return normalized
}

async function mutatePostgresDatabase(mutator) {
  const client = await pool.connect()

  try {
    await client.query('BEGIN')

    const locked = await client.query('SELECT data FROM app_state WHERE id = $1 FOR UPDATE', [STATE_ROW_ID])
    const data = locked.rows[0]?.data || cloneDefaultDatabase()
    const { normalized } = normalizeDatabaseShape(data)

    const result = await mutator(normalized)

    await client.query('UPDATE app_state SET data = $2::jsonb, updated_at = NOW() WHERE id = $1', [
      STATE_ROW_ID,
      JSON.stringify(normalized),
    ])

    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

async function ensureJsonDatabase() {
  await fs.mkdir(DATA_DIR, { recursive: true })

  try {
    await fs.access(DB_PATH)
  } catch {
    await fs.writeFile(DB_PATH, JSON.stringify(defaultDatabase, null, 2), 'utf-8')
  }

  const db = await readJsonDatabase()
  let shouldPersist = false

  for (const [key, fallback] of Object.entries(defaultDatabase)) {
    if (!(key in db)) {
      db[key] = fallback
      shouldPersist = true
    }
  }

  if (shouldPersist) {
    await writeJsonDatabase(db)
  }

  return db
}

async function readJsonDatabase() {
  try {
    const raw = await fs.readFile(DB_PATH, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return structuredClone(defaultDatabase)
  }
}

async function writeJsonDatabase(data) {
  await fs.writeFile(DB_PATH, JSON.stringify(data, null, 2), 'utf-8')
}

export async function ensureDatabase() {
  if (usingPostgres) {
    return ensurePostgresDatabase()
  }

  return ensureJsonDatabase()
}

export async function readDatabase() {
  if (usingPostgres) {
    return readPostgresDatabase()
  }

  return readJsonDatabase()
}

export async function writeDatabase(data) {
  if (usingPostgres) {
    await pool.query('UPDATE app_state SET data = $2::jsonb, updated_at = NOW() WHERE id = $1', [
      STATE_ROW_ID,
      JSON.stringify(data),
    ])
    return
  }

  await writeJsonDatabase(data)
}

export async function mutateDatabase(mutator) {
  if (usingPostgres) {
    return mutatePostgresDatabase(mutator)
  }

  const db = await readDatabase()
  const result = await mutator(db)
  await writeDatabase(db)
  return result
}

export function nextNumericId(items) {
  const max = items.reduce((acc, item) => {
    const value = Number(item.id)
    return Number.isFinite(value) ? Math.max(acc, value) : acc
  }, 0)

  return String(max + 1)
}

export function createTicketNumber() {
  const stamp = new Date().toISOString().slice(0, 10).replaceAll('-', '')
  const short = randomUUID().slice(0, 6).toUpperCase()
  return `CH-${stamp}-${short}`
}

export function nowIso() {
  return new Date().toISOString()
}

export function getDatabasePath() {
  if (usingPostgres) {
    try {
      const parsed = new URL(process.env.DATABASE_URL)
      const host = parsed.hostname || 'postgres'
      const databaseName = parsed.pathname?.slice(1) || 'database'
      return `postgres://${host}/${databaseName}`
    } catch {
      return 'postgres'
    }
  }

  return DB_PATH
}

export function isUsingPostgres() {
  return usingPostgres
}
