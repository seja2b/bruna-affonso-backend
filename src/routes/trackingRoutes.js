import express from 'express'
import authMiddleware from '../middleware/authMiddleware.js'
import { requireRole } from '../middleware/roleMiddleware.js'
import rankingPrivacyMiddleware from '../middleware/rankingPrivacyMiddleware.js'
import {
  getStudentWeeks,
  saveTrackingExercise,
  completeWeek,
  saveStudentNote,
  saveTeacherNote,
  getAdminStudentWeeks,
  getAdminWeek,
  releaseWeekManually,
  getRanking,
  getStudentsTracking,
  updateProfilePhoto,
  createProgramWorkout,
  updateAdminWeekDates,
  resetStudentProgram,
  clearStudentWeeks,
  updateStudentPackage
} from '../controllers/trackingController.js'

const router = express.Router()

router.use(authMiddleware)

// Aluno - Semanas e exercícios
router.get('/student/:studentId/weeks', requireRole('STUDENT'), getStudentWeeks)
router.get('/week/:weekId', requireRole('STUDENT'), getStudentWeeks)
router.post('/exercise/save', requireRole('STUDENT'), saveTrackingExercise)
router.post('/week/:weekId/complete', requireRole('STUDENT'), completeWeek)
router.put('/note/student', requireRole('STUDENT'), saveStudentNote)
router.put('/profile-photo/:studentId', requireRole('STUDENT'), updateProfilePhoto)

// Admin - acompanhamento por aluno e semana
router.get('/admin/student/:studentId/weeks', requireRole('ADMIN'), getAdminStudentWeeks)
router.get('/admin/week/:weekId', requireRole('ADMIN'), getAdminWeek)
router.put('/admin/week/:weekId/release', requireRole('ADMIN'), releaseWeekManually)
router.put('/admin/week/:weekId/dates', requireRole('ADMIN'), updateAdminWeekDates)
router.post('/admin/student/:studentId/workouts', requireRole('ADMIN'), createProgramWorkout)
router.delete('/admin/student/:studentId/program', requireRole('ADMIN'), resetStudentProgram)
router.post('/admin/student/:studentId/weeks/clear', requireRole('ADMIN'), clearStudentWeeks)
router.put('/admin/student/:studentId/package', requireRole('ADMIN'), updateStudentPackage)
router.put('/week/:weekId/observation', requireRole('ADMIN'), saveTeacherNote)
router.get('/students', requireRole('ADMIN'), getStudentsTracking)

// Ranking - disponível para usuários autenticados, com dados pessoais minimizados
router.get('/ranking', rankingPrivacyMiddleware, getRanking)

export default router
