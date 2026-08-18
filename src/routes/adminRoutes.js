import express from 'express'
import authMiddleware from '../middleware/authMiddleware.js'
import { requireRole } from '../middleware/roleMiddleware.js'
import {
  getDashboard,
  getStudents,
  getStudentDetails,
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
  getSettings,
  updateSettings
} from '../controllers/adminController.js'
import { getAdminQuestions, answerQuestionWithNotification } from '../controllers/adminQuestionController.js'

const router = express.Router()

router.use(authMiddleware, requireRole('ADMIN'))

router.get('/dashboard', getDashboard)

router.get('/students', getStudents)
router.get('/students/:studentId', getStudentDetails)
router.put('/students/:studentId/approve', approveStudent)
router.put('/students/:studentId/reject', rejectStudent)
router.put('/students/:studentId/deactivate', deactivateStudent)
router.put('/students/:studentId/reactivate', reactivateStudent)

router.get('/categories', getCategories)
router.post('/categories', createCategory)

router.post('/workouts', createWorkoutAdmin)
router.put('/workouts/:workoutId', updateWorkoutAdmin)
router.delete('/workouts/:workoutId', deleteWorkoutAdmin)

router.get('/questions', getAdminQuestions)
router.get('/questions/pending', getPendingQuestions)
router.post('/questions/:questionId/answer', answerQuestionWithNotification)

router.get('/settings', getSettings)
router.put('/settings', updateSettings)

export default router
