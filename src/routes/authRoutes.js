import express from 'express'
import authMiddleware from '../middleware/authMiddleware.js'
import { createRateLimiter } from '../middleware/rateLimitMiddleware.js'
import { login, register, refreshSession, getMe, updateMe, logout } from '../controllers/authController.js'

const router = express.Router()

const loginLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 15, scope: 'login' })
const registerLimiter = createRateLimiter({ windowMs: 60 * 60 * 1000, max: 8, scope: 'register' })
const refreshLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 60, scope: 'refresh' })

// Públicas
router.post('/login', loginLimiter, login)
router.post('/register', registerLimiter, register)
router.post('/refresh', refreshLimiter, refreshSession)

// Protegidas
router.post('/logout', authMiddleware, logout)
router.get('/me', authMiddleware, getMe)
router.put('/me', authMiddleware, updateMe)

export default router
