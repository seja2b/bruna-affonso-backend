const { prisma } = require('../config/database');

async function getWorkouts(req, res) {
  try {
    const workouts = await prisma.workout.findMany({
      orderBy: { createdAt: 'desc' }
    });
    return res.json(workouts);
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao buscar treinos' });
  }
}

async function createWorkout(req, res) {
  try {
    const userId = req.userId;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    
    if (user?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Apenas admin pode criar treinos' });
    }

    const { title, description, videoUrl, duration, difficulty } = req.body;

    if (!title || !videoUrl) {
      return res.status(400).json({ error: 'Título e URL do vídeo são obrigatórios' });
    }

    const workout = await prisma.workout.create({
      data: { title, description, videoUrl, duration, difficulty }
    });

    return res.status(201).json(workout);
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao criar treino' });
  }
}

async function updateWorkout(req, res) {
  try {
    const userId = req.userId;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    
    if (user?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Apenas admin pode editar treinos' });
    }

    const { id } = req.params;
    const { title, description, videoUrl, duration, difficulty } = req.body;

    const workout = await prisma.workout.update({
      where: { id },
      data: { title, description, videoUrl, duration, difficulty }
    });

    return res.json(workout);
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao atualizar treino' });
  }
}

async function deleteWorkout(req, res) {
  try {
    const userId = req.userId;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    
    if (user?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Apenas admin pode deletar treinos' });
    }

    const { id } = req.params;
    await prisma.workout.delete({ where: { id } });

    return res.json({ message: 'Treino deletado com sucesso' });
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao deletar treino' });
  }
}

module.exports = { getWorkouts, createWorkout, updateWorkout, deleteWorkout };