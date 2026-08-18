import express from 'express'
import { requireRole } from '../middleware/roleMiddleware.js'
import { getSettings, updateSettings } from '../controllers/settingsController.js'

const router = express.Router()

router.get('/', getSettings)
router.put('/', requireRole('ADMIN'), updateSettings)

export default router
