import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

const DATA_DIR = path.resolve(process.cwd(), 'server', 'data')
const DB_PATH = path.join(DATA_DIR, 'database.json')

const defaultDatabase = {
  usuarios: [],
  chamados: [],
  historico: [],
  configuracoes: {},
}

export async function ensureDatabase() {
  await fs.mkdir(DATA_DIR, { recursive: true })

  try {
    await fs.access(DB_PATH)
  } catch {
    await fs.writeFile(DB_PATH, JSON.stringify(defaultDatabase, null, 2), 'utf-8')
  }

  const db = await readDatabase()
  let shouldPersist = false

  for (const [key, fallback] of Object.entries(defaultDatabase)) {
    if (!(key in db)) {
      db[key] = fallback
      shouldPersist = true
    }
  }

  if (shouldPersist) {
    await writeDatabase(db)
  }

  return db
}

export async function readDatabase() {
  try {
    const raw = await fs.readFile(DB_PATH, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return structuredClone(defaultDatabase)
  }
}

export async function writeDatabase(data) {
  await fs.writeFile(DB_PATH, JSON.stringify(data, null, 2), 'utf-8')
}

export async function mutateDatabase(mutator) {
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
  return DB_PATH
}
