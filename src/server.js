import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { PrismaClient } from '@prisma/client'
import authRoutes from './routes/authRoutes.js'
import adminRoutes from './routes/adminRoutes.js'
import settingsRoutes from './routes/settingsRoutes.js'
import trackingRoutes from './routes/trackingRoutes.js'
import workoutRoutes from './routes/workoutRoutes.js'
import authMiddleware from './middleware/authMiddleware.js'

dotenv.config()

const app = express()
const prisma = new PrismaClient()
const PORT = process.env.PORT || 3000

// CORS CONFIGURAÇÃO - ACEITA CLOUDFLARE + LOCALHOST + CODESPACES
const allowedOrigins = [
  'https://bruna-affonso-frontend.pages.dev',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  /\.app\.github\.dev$/ // Aceita qualquer Codespace
]

const corsOptions = {
  origin: function (origin, callback) {
    // Permitir requests sem origin (mobile, curl, etc)
    if (!origin) return callback(null, true)
    
    // Verificar se é uma origem permitida
    const isAllowed = allowedOrigins.some(allowed => {
      if (allowed instanceof RegExp) {
        return allowed.test(origin)
      }
      return allowed === origin
    })

    if (isAllowed) {
      callback(null, true)
    } else {
      callback(new Error('CORS não permitido'))
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}

// Middleware
app.use(cors(corsOptions))
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ limit: '50mb', extended: true }))

// Rotas públicas
app.use('/api/auth', authRoutes)

// Rotas protegidas (requerem autenticação)
app.use('/api/admin', authMiddleware, adminRoutes)
app.use('/api/admin/settings', settingsRoutes)
app.use('/api/tracking', authMiddleware, trackingRoutes)
app.use('/api/workouts', workoutRoutes)

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() })
})

// Rota 404
app.use((req, res) => {
  res.status(404).json({ error: 'Rota não encontrada' })
})

// Error handling
app.use((err, req, res, next) => {
  console.error('Erro:', err)
  res.status(500).json({ error: 'Erro interno do servidor' })
})

// Iniciar servidor
const server = app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando em http://localhost:${PORT}`)
  console.log(`🌍 Ambiente: ${process.env.NODE_ENV || 'development'}`)
})

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('📛 Encerrando servidor...')
  server.close(() => {
    console.log('✅ Servidor encerrado')
    process.exit(0)
  })
})

process.on('SIGINT', async () => {
  console.log('📛 Encerrando servidor...')
  await prisma.$disconnect()
  server.close(() => {
    console.log('✅ Servidor encerrado')
    process.exit(0)
  })
})

export default app