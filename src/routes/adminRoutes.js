const express = require('express');
const {
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
} = require('../controllers/adminController');
const { authMiddleware } = require('../middleware/authMiddleware');

const router = express.Router();

// Dashboard
router.get('/dashboard', authMiddleware, getDashboard);

// Alunos
router.get('/students', authMiddleware, getStudents);
router.put('/students/:studentId/approve', authMiddleware, approveStudent);
router.put('/students/:studentId/reject', authMiddleware, rejectStudent);
router.put('/students/:studentId/deactivate', authMiddleware, deactivateStudent);
router.put('/students/:studentId/reactivate', authMiddleware, reactivateStudent);

// Categorias
router.get('/categories', authMiddleware, getCategories);
router.post('/categories', authMiddleware, createCategory);

// Treinos
router.post('/workouts', authMiddleware, createWorkoutAdmin);
router.put('/workouts/:workoutId', authMiddleware, updateWorkoutAdmin);
router.delete('/workouts/:workoutId', authMiddleware, deleteWorkoutAdmin);

// Perguntas
router.get('/questions/pending', authMiddleware, getPendingQuestions);
router.post('/questions/:questionId/answer', authMiddleware, answerQuestion);

// Configurações
router.get('/settings', authMiddleware, getSettings);
router.put('/settings', authMiddleware, updateSettings);

module.exports = router;