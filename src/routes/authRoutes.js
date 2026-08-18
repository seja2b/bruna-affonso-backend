import express from 'express'
import authMiddleware from '../middleware/authMiddleware.js'
import { login, register, refreshSession, getMe, logout } from '../controllers/authController.js'

const router = express.Router()

// Públicas
router.post('/login', login)
router.post('/register', register)
router.post('/refresh', refreshSession)

// Protegidas
router.post('/logout', authMiddleware, logout)
router.get('/me', authMiddleware, getMe)

export default router
