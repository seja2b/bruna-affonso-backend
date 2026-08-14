import express from 'express'
import { authMiddleware, adminOnly, studentOnly } from '../middleware/authMiddleware.js'
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

// ROTAS DO ALUNO (protegidas)
router.get('/student/:studentId/weeks', authMiddleware, studentOnly, getStudentWeeks)
router.post('/exercise/save', authMiddleware, studentOnly, saveTrackingExercise)
router.put('/note/student', authMiddleware, studentOnly, saveStudentNote)
router.put('/profile-photo/:studentId', authMiddleware, studentOnly, updateProfilePhoto)

// ROTAS DO PROFESSOR (protegidas - ADMIN ONLY)
router.put('/note/teacher', authMiddleware, adminOnly, saveTeacherNote)
router.get('/admin/students', authMiddleware, adminOnly, getStudentsTracking)

// RANKING (PÚBLICO - mas protegido)
router.get('/ranking', authMiddleware, getRanking)

export default router