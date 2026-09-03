import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { PrismaClient } from '@prisma/client'
import authRoutes from './routes/authRoutes.js'
import adminRoutes from './routes/adminRoutes.js'
import settingsRoutes from './routes/settingsRoutes.js'
import trackingRoutes from './routes/trackingRoutes.js'
import workoutRoutes from './routes/workoutRoutes.js'
import questionRoutes from './routes/questionRoutes.js'
import videoRoutes from './routes/videoRoutes.js'
import notificationRoutes from './routes/notificationRoutes.js'
import assessmentRoutes from './routes/assessmentRoutes.js'
import ebookRoutes from './routes/ebookRoutes.js'
import authMiddleware from './middleware/authMiddleware.js'
import securityHeadersMiddleware from './middleware/securityHeadersMiddleware.js'

dotenv.config()

const app = express()
const prisma = new PrismaClient()
const PORT = process.env.PORT || 3000
const isProduction = process.env.NODE_ENV === 'production'

// Railway e outros PaaS ficam atrás de proxy reverso. Confiar apenas no número
// configurado de saltos permite que req.ip seja usado sem aceitar x-forwarded-for
// arbitrário enviado diretamente pelo cliente.
if (isProduction) {
  const configuredHops = Number.parseInt(process.env.TRUST_PROXY_HOPS || '1', 10)
  app.set('trust proxy', Number.isFinite(configuredHops) && configuredHops >= 0 ? configuredHops : 1)
}

function parseAllowedOrigins() {
  const configured = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)

  if (configured.length > 0) return configured

  return [
    'https://bruna-affonso-frontend.pages.dev',
    ...(!isProduction ? [
      'http://localhost:5173',
      'http://localhost:3000',
      'http://127.0.0.1:5173'
    ] : [])
  ]
}

const allowedOrigins = parseAllowedOrigins()

const corsOptions = {
  origin(origin, callback) {
    if (!origin) return callback(null, true)

    const isConfiguredOrigin = allowedOrigins.includes(origin)
    const isDevCodespace = !isProduction && /\.app\.github\.dev$/.test(origin)

    if (isConfiguredOrigin || isDevCodespace) return callback(null, true)
    return callback(new Error('Origem não permitida pelo CORS'))
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}

const requestBodyLimit = process.env.REQUEST_BODY_LIMIT || '6mb'

app.disable('x-powered-by')
app.use(securityHeadersMiddleware)
app.use(cors(corsOptions))
app.use(express.json({ limit: requestBodyLimit }))
app.use(express.urlencoded({ limit: requestBodyLimit, extended: true }))

app.use('/api/auth', authRoutes)

// Compatibilidade: alunos já consomem /api/admin/settings para dados públicos da plataforma.
// A leitura continua disponível apenas para usuários autenticados; escrita exige ADMIN.
app.use('/api/admin/settings', authMiddleware, settingsRoutes)
app.use('/api/settings', authMiddleware, settingsRoutes)

app.use('/api/admin', adminRoutes)
app.use('/api/tracking', trackingRoutes)
app.use('/api/workouts', workoutRoutes)
app.use('/api/questions', questionRoutes)
app.use('/api/videos', videoRoutes)
app.use('/api/notifications', notificationRoutes)
app.use('/api/assessments', assessmentRoutes)
app.use('/api/ebooks', ebookRoutes)

app.get('/health', (req, res) => {
  res.set('Cache-Control', 'no-store')
  res.json({ status: 'OK', timestamp: new Date().toISOString() })
})

app.use((req, res) => {
  res.status(404).json({ error: 'Rota não encontrada' })
})

app.use((err, req, res, next) => {
  if (err.message === 'Origem não permitida pelo CORS') {
    return res.status(403).json({ error: 'Origem não permitida' })
  }

  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Conteúdo enviado excede o tamanho permitido' })
  }

  console.error('Erro não tratado:', err)
  return res.status(500).json({ error: 'Erro interno do servidor' })
})

const server = app.listen(PORT, () => {
  console.log(`Servidor iniciado na porta ${PORT}`)
  console.log(`Ambiente: ${process.env.NODE_ENV || 'development'}`)
})

// Reduz a janela para conexões lentas/maliciosas sem alterar o fluxo normal da API.
server.requestTimeout = Number(process.env.REQUEST_TIMEOUT_MS || 30_000)
server.headersTimeout = Number(process.env.HEADERS_TIMEOUT_MS || 35_000)
server.keepAliveTimeout = Number(process.env.KEEP_ALIVE_TIMEOUT_MS || 5_000)

async function shutdown(signal) {
  console.log(`Recebido ${signal}. Encerrando servidor...`)
  await prisma.$disconnect()
  server.close(() => process.exit(0))
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

export default app
