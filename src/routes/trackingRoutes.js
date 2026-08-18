import express from 'express'
import authMiddleware from '../middleware/authMiddleware.js'
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

// Aluno - Semanas e exercícios
router.get('/student/:studentId/weeks', authMiddleware, getStudentWeeks)
router.get('/week/:weekId', authMiddleware, getStudentWeeks)
router.post('/exercise/save', authMiddleware, saveTrackingExercise)
router.put('/note/student', authMiddleware, saveStudentNote)
router.put('/week/:weekId/observation', authMiddleware, saveTeacherNote)
router.put('/profile-photo/:studentId', authMiddleware, updateProfilePhoto)

// Admin - Tracking geral
router.get('/students', authMiddleware, getStudentsTracking)

// Ranking
router.get('/ranking', authMiddleware, getRanking)

export default router