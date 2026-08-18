import express from 'express'
import authMiddleware from '../middleware/authMiddleware.js'
import { requireRole } from '../middleware/roleMiddleware.js'
import {
  getStudentWeeks,
  saveTrackingExercise,
  saveStudentNote,
  saveTeacherNote,
  getAdminStudentWeeks,
  getAdminWeek,
  releaseWeekManually,
  getRanking,
  getStudentsTracking,
  updateProfilePhoto
} from '../controllers/trackingController.js'

const router = express.Router()

router.use(authMiddleware)

// Aluno - Semanas e exercícios
router.get('/student/:studentId/weeks', requireRole('STUDENT'), getStudentWeeks)
router.get('/week/:weekId', requireRole('STUDENT'), getStudentWeeks)
router.post('/exercise/save', requireRole('STUDENT'), saveTrackingExercise)
router.put('/note/student', requireRole('STUDENT'), saveStudentNote)
router.put('/profile-photo/:studentId', requireRole('STUDENT'), updateProfilePhoto)

// Admin - acompanhamento por aluno e semana
router.get('/admin/student/:studentId/weeks', requireRole('ADMIN'), getAdminStudentWeeks)
router.get('/admin/week/:weekId', requireRole('ADMIN'), getAdminWeek)
router.put('/admin/week/:weekId/release', requireRole('ADMIN'), releaseWeekManually)
router.put('/week/:weekId/observation', requireRole('ADMIN'), saveTeacherNote)
router.get('/students', requireRole('ADMIN'), getStudentsTracking)

// Ranking - disponível para usuários autenticados
router.get('/ranking', getRanking)

export default router
