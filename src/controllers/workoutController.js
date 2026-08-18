import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export async function getWorkouts(req, res) {
  try {
    const workouts = await prisma.workout.findMany({
      include: { category: true }
    })
    return res.json(workouts)
  } catch (error) {
    console.error('Erro ao buscar treinos:', error)
    return res.status(500).json({ error: 'Erro ao buscar treinos' })
  }
}

export async function getWorkoutById(req, res) {
  try {
    const { id } = req.params
    
    const workout = await prisma.workout.findUnique({
      where: { id },
      include: { category: true }
    })

    if (!workout) {
      return res.status(404).json({ error: 'Treino não encontrado' })
    }

    return res.json(workout)
  } catch (error) {
    console.error('Erro ao buscar treino:', error)
    return res.status(500).json({ error: 'Erro ao buscar treino' })
  }
}