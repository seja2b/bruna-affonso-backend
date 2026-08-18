import express from 'express'
import authMiddleware from '../middleware/authMiddleware.js'
import { requireRole } from '../middleware/roleMiddleware.js'
import { getSettings, updateSettings } from '../controllers/settingsController.js'

const router = express.Router()

router.get('/', getSettings)
router.put('/', authMiddleware, requireRole('ADMIN'), updateSettings)

export default router
