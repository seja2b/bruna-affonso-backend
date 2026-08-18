import express from 'express'
import authMiddleware from '../middleware/authMiddleware.js'
import { requireRole } from '../middleware/roleMiddleware.js'
import { createQuestion, getMyQuestions } from '../controllers/questionController.js'

const router = express.Router()

router.use(authMiddleware, requireRole('STUDENT'))
router.get('/', getMyQuestions)
router.post('/', createQuestion)

export default router
