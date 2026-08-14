import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { PrismaClient } from '@prisma/client'
import authRoutes from './routes/authRoutes.js'
import trackingRoutes from './routes/trackingRoutes.js'

dotenv.config()
const prisma = new PrismaClient()
const app = express()

// Middleware
app.use(express.json())
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}))

// Rotas
app.use('/api/auth', authRoutes)
app.use('/api/tracking', trackingRoutes)

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Servidor rodando!' })
})

// Error handling
app.use((err, req, res, next) => {
  console.error(err)
  res.status(500).json({ error: err.message })
})

// Start server
const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando em http://localhost:${PORT}`)
  console.log(`🌍 Ambiente: ${process.env.NODE_ENV}`)
})