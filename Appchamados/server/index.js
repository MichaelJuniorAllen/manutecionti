import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import path from 'node:path'
import authRoutes from './routes/auth.routes.js'
import profileRoutes from './routes/profile.routes.js'
import settingsRoutes from './routes/settings.routes.js'
import ticketsRoutes from './routes/tickets.routes.js'
import { ensureDatabase, getDatabasePath, isUsingPostgres } from './services/database.js'

const app = express()
const PORT = Number(process.env.PORT || 4000)

function getAllowedOrigins() {
  const configuredOrigins = String(process.env.CORS_ORIGINS || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

  if (configuredOrigins.length) {
    return configuredOrigins
  }

  return ['http://localhost:5173']
}

const allowedOrigins = getAllowedOrigins()

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function createOriginMatcher(origins) {
  const exactOrigins = new Set()
  const wildcardMatchers = []

  for (const origin of origins) {
    if (origin.includes('*')) {
      const pattern = `^${escapeRegExp(origin).replace(/\\\*/g, '.*')}$`
      wildcardMatchers.push(new RegExp(pattern))
      continue
    }

    exactOrigins.add(origin)
  }

  return (origin) => {
    if (exactOrigins.has(origin)) {
      return true
    }

    return wildcardMatchers.some((regex) => regex.test(origin))
  }
}

const isAllowedOrigin = createOriginMatcher(allowedOrigins)

const corsOptions = {
  credentials: true,
  origin(origin, callback) {
    if (!origin || isAllowedOrigin(origin)) {
      callback(null, true)
      return
    }

    callback(new Error('Origem não permitida pelo CORS.'))
  },
}

async function initializeApplication() {
  await ensureDatabase()

  app.use(cors(corsOptions))
  app.use(express.json({ limit: '3mb' }))
  app.use(express.urlencoded({ extended: true }))
  app.use('/uploads', express.static(path.resolve(process.cwd(), 'public', 'uploads')))

  app.get('/api/health', (_, res) => {
    res.json({ status: 'ok', db: getDatabasePath(), driver: isUsingPostgres() ? 'postgres' : 'json' })
  })

  app.use('/api/auth', authRoutes)
  app.use('/api/profile', profileRoutes)
  app.use('/api/tickets', ticketsRoutes)
  app.use('/api/settings', settingsRoutes)

  app.use((error, _, res, __) => {
    if (error?.message?.includes('Formato inválido')) {
      return res.status(400).json({ message: error.message })
    }
    return res.status(500).json({ message: error.message || 'Erro interno no servidor.' })
  })

  app.listen(PORT, () => {
    console.log(`Servidor iniciado na porta ${PORT}`)
    console.log(`Banco pronto em ${getDatabasePath()}`)
    console.log(`Driver de persistencia: ${isUsingPostgres() ? 'PostgreSQL' : 'JSON local'}`)
    console.log(`CORS liberado para: ${allowedOrigins.join(', ')}`)
  })
}

initializeApplication().catch((error) => {
  console.error('Falha na inicialização da aplicação:', error)
  process.exit(1)
})
