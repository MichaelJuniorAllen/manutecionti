import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import { rateLimit } from 'express-rate-limit'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import './db/database.js'
import authRoutes from './routes/auth.js'
import reportsRoutes from './routes/reports.js'
import ticketsRoutes from './routes/tickets.js'
import usersRoutes from './routes/users.js'

const app = express()
const port = Number(process.env.PORT || 4000)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const frontendDist = path.resolve(__dirname, '../../frontend/dist')
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      return callback(null, true)
    }

    return callback(new Error('Origem não permitida pelo CORS.'))
  }
}))

app.use(express.json({ limit: '1mb' }))

// Rate limiting — protects against brute-force and DoS attacks
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,                   // max 20 auth attempts per window per IP
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Muitas tentativas. Aguarde 15 minutos e tente novamente.' },
})

const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 200,            // max 200 requests per minute per IP
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Limite de requisições atingido. Tente novamente em instantes.' },
})

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'nova-versao-backend' })
})

app.use('/api/auth', authLimiter, authRoutes)
app.use('/api/tickets', apiLimiter, ticketsRoutes)
app.use('/api/reports', apiLimiter, reportsRoutes)
app.use('/api/users', apiLimiter, usersRoutes)

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Rota da API não encontrada.' })
})

if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist))
  app.get(/^\/(?!api).*/, (req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'))
  })
}

app.use((req, res) => {
  res.status(404).json({ error: 'Rota não encontrada.' })
})

app.use((error, req, res, next) => {
  console.error(error)
  const status = error.status || 500
  const message = status === 500 ? 'Erro interno do servidor.' : error.message
  res.status(status).json({ error: message })
})

app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`)
})
