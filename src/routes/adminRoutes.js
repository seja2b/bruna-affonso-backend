import express from 'express'
import authMiddleware from '../middleware/authMiddleware.js'
import { requireRole } from '../middleware/roleMiddleware.js'
import sanitizeAdminResponseMiddleware from '../middleware/sanitizeAdminResponseMiddleware.js'
import {
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
  updateSettings,
  getAdministrators,
  getAdministratorCandidates,
  promoteAdministrator,
  removeAdministrator
} from '../controllers/adminController.js'
import { getAdminDashboard } from '../controllers/adminDashboardController.js'
import { getAdminQuestions, answerQuestionWithNotification } from '../controllers/adminQuestionController.js'
import { getAdminAssessments, getVideos, releaseReassessment, updateVideos } from '../controllers/assessmentController.js'

const router = express.Router()

router.use(authMiddleware, requireRole('ADMIN'), sanitizeAdminResponseMiddleware)

router.get('/dashboard', getAdminDashboard)

router.get('/administrators', getAdministrators)
router.get('/administrators/candidates', getAdministratorCandidates)
router.put('/administrators/:userId/promote', promoteAdministrator)
router.put('/administrators/:userId/remove', removeAdministrator)

router.get('/students', getStudents)
router.get('/students/:studentId', getStudentDetails)
router.put('/students/:studentId/approve', approveStudent)
router.put('/students/:studentId/reject', rejectStudent)
router.put('/students/:studentId/deactivate', deactivateStudent)
router.put('/students/:studentId/reactivate', reactivateStudent)
router.get('/students/:studentId/assessments', getAdminAssessments)
router.post('/students/:studentId/reassessments', releaseReassessment)
router.get('/assessment-videos', getVideos)
router.put('/assessment-videos', updateVideos)

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
