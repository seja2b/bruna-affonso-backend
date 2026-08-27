import express from 'express'
import authMiddleware from '../middleware/authMiddleware.js'
import { getWorkouts, getWorkoutById } from '../controllers/workoutController.js'

const router = express.Router()

router.use(authMiddleware)
router.get('/', getWorkouts)
router.get('/:id', getWorkoutById)

export default router
