const express = require('express');
const { getWorkouts, createWorkout, updateWorkout, deleteWorkout } = require('../controllers/workoutController');
const { authMiddleware } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/', getWorkouts);
router.post('/', authMiddleware, createWorkout);
router.put('/:id', authMiddleware, updateWorkout);
router.delete('/:id', authMiddleware, deleteWorkout);

module.exports = router;