import express from 'express'
import authMiddleware from '../middleware/authMiddleware.js'
import { login, register, getMe, logout } from '../controllers/authController.js'

const router = express.Router()

// Públicas
router.post('/login', login)
router.post('/register', register)
router.post('/logout', logout)

// Protegidas
router.get('/me', authMiddleware, getMe)

export default router