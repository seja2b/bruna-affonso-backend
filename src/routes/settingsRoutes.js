import express from 'express'
import authMiddleware from '../middleware/authMiddleware.js'
import { getSettings, updateSettings } from '../controllers/settingsController.js'

const router = express.Router()

router.get('/', getSettings)
router.put('/', authMiddleware, updateSettings)

export default router