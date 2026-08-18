import express from 'express'
import authMiddleware from '../middleware/authMiddleware.js'
import { requireRole } from '../middleware/roleMiddleware.js'
import {
  getStudentWeeks,
  saveTrackingExercise,
  saveStudentNote,
  saveTeacherNote,
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

// Admin - Tracking geral
router.put('/week/:weekId/observation', requireRole('ADMIN'), saveTeacherNote)
router.get('/students', requireRole('ADMIN'), getStudentsTracking)

// Ranking - disponível para usuários autenticados
router.get('/ranking', getRanking)

export default router
