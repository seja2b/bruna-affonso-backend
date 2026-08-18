import express from 'express'
import { getSettings, updateSettings } from '../controllers/settingsController.js'
import { authMiddleware, adminOnly } from '../middleware/authMiddleware.js'

const router = express.Router()

// GET - Buscar configurações (qualquer um autenticado pode ver)
router.get('/', authMiddleware, getSettings)

// PUT - Atualizar configurações (apenas ADMIN)
router.put('/', authMiddleware, adminOnly, updateSettings)

export default router