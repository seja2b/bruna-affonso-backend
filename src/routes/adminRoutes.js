import express from 'express'
import authMiddleware from '../middleware/authMiddleware.js'
import { requireRole } from '../middleware/roleMiddleware.js'
import {
  getDashboard,
  getStudents,
  approveStudent,
  rejectStudent,
  deactivateStudent,
  reactivateStudent,
  getCategories,
  createCategory,
  createWorkoutAdmin,
  updateWorkoutAdmin,
  deleteWorkoutAdmin,
  getPendingQuestions,
  answerQuestion,
  getSettings,
  updateSettings
} from '../controllers/adminController.js'

const router = express.Router()

router.use(authMiddleware, requireRole('ADMIN'))

// Dashboard
router.get('/dashboard', getDashboard)

// Alunos
router.get('/students', getStudents)
router.put('/students/:studentId/approve', approveStudent)
router.put('/students/:studentId/reject', rejectStudent)
router.put('/students/:studentId/deactivate', deactivateStudent)
router.put('/students/:studentId/reactivate', reactivateStudent)

// Categorias
router.get('/categories', getCategories)
router.post('/categories', createCategory)

// Treinos
router.post('/workouts', createWorkoutAdmin)
router.put('/workouts/:workoutId', updateWorkoutAdmin)
router.delete('/workouts/:workoutId', deleteWorkoutAdmin)

// Perguntas
router.get('/questions/pending', getPendingQuestions)
router.post('/questions/:questionId/answer', answerQuestion)

// Configurações
router.get('/settings', getSettings)
router.put('/settings', updateSettings)

export default router
