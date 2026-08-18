import express from 'express'
import { getWorkouts, getWorkoutById } from '../controllers/workoutController.js'

const router = express.Router()

router.get('/', getWorkouts)
router.get('/:id', getWorkoutById)

export default router