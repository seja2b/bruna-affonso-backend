import express from 'express'
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

// ROTAS DO ALUNO
router.get('/student/:studentId/weeks', getStudentWeeks)
router.post('/exercise/save', saveTrackingExercise)
router.put('/note/student', saveStudentNote)
router.put('/profile-photo/:studentId', updateProfilePhoto)

// ROTAS DO PROFESSOR (ADMIN)
router.put('/note/teacher', saveTeacherNote)
router.get('/admin/students', getStudentsTracking)

// RANKING (PÚBLICO)
router.get('/ranking', getRanking)

export default router