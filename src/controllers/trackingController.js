import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// GET todas as semanas do aluno (com liberação automática)
export const getStudentWeeks = async (req, res) => {
  try {
    const { studentId } = req.params

    // Pega todas as semanas do aluno
    let weeks = await prisma.weeklyTracking.findMany({
      where: { studentId },
      include: {
        exercises: true,
        observation: true
      },
      orderBy: { weekNumber: 'asc' }
    })

    // Se não houver semanas, cria a primeira
    if (weeks.length === 0) {
      const startDate = new Date()
      startDate.setDate(startDate.getDate() - startDate.getDay() + 1) // Começa na segunda
      const endDate = new Date(startDate)
      endDate.setDate(endDate.getDate() + 6)

      const week1 = await prisma.weeklyTracking.create({
        data: {
          studentId,
          weekNumber: 1,
          startDate,
          endDate,
          isReleased: true // Semana 1 sempre liberada
        },
        include: { exercises: true, observation: true }
      })
      weeks = [week1]
    }

    // Valida liberação automática (toda segunda-feira, libera a próxima semana)
    for (let i = 1; i < weeks.length; i++) {
      const previousWeek = weeks[i - 1]
      const currentWeek = weeks[i]

      // Se semana anterior foi completada há 7 dias, libera a próxima
      if (previousWeek.isCompleted && previousWeek.completedAt) {
        const sevenDaysLater = new Date(previousWeek.completedAt)
        sevenDaysLater.setDate(sevenDaysLater.getDate() + 7)

        if (new Date() >= sevenDaysLater && !currentWeek.isReleased) {
          await prisma.weeklyTracking.update({
            where: { id: currentWeek.id },
            data: { isReleased: true }
          })
          currentWeek.isReleased = true
        }
      }
    }

    return res.json(weeks)
  } catch (error) {
    console.error('Error getStudentWeeks:', error)
    return res.status(500).json({ error: error.message })
  }
}

// POST/PUT exercício de tracking
export const saveTrackingExercise = async (req, res) => {
  try {
    const { weeklyTrackingId, exerciseName, trainingType, weight, reps, notes } = req.body

    // Valida se semana existe e está liberada
    const week = await prisma.weeklyTracking.findUnique({
      where: { id: weeklyTrackingId }
    })

    if (!week || !week.isReleased) {
      return res.status(403).json({ error: 'Semana não liberada' })
    }

    // Procura exercício existente
    let exercise = await prisma.trackingExercise.findFirst({
      where: {
        weeklyTrackingId,
        exerciseName,
        trainingType
      }
    })

    if (exercise) {
      // Atualiza
      exercise = await prisma.trackingExercise.update({
        where: { id: exercise.id },
        data: { weight, reps, notes }
      })
    } else {
      // Cria novo
      exercise = await prisma.trackingExercise.create({
        data: {
          weeklyTrackingId,
          exerciseName,
          trainingType,
          weight,
          reps,
          notes
        }
      })
    }

    // Verifica se semana está completa
    await checkWeekCompletion(weeklyTrackingId)

    return res.json(exercise)
  } catch (error) {
    console.error('Error saveTrackingExercise:', error)
    return res.status(500).json({ error: error.message })
  }
}

// PUT observação do aluno
export const saveStudentNote = async (req, res) => {
  try {
    const { weeklyTrackingId, studentNote } = req.body

    let observation = await prisma.weeklyObservation.findUnique({
      where: { weeklyTrackingId }
    })

    if (observation) {
      observation = await prisma.weeklyObservation.update({
        where: { weeklyTrackingId },
        data: { studentNote }
      })
    } else {
      observation = await prisma.weeklyObservation.create({
        data: {
          weeklyTrackingId,
          studentNote
        }
      })
    }

    return res.json(observation)
  } catch (error) {
    console.error('Error saveStudentNote:', error)
    return res.status(500).json({ error: error.message })
  }
}

// PUT observação do professor (ADMIN ONLY)
export const saveTeacherNote = async (req, res) => {
  try {
    const { weeklyTrackingId, teacherNote } = req.body

    let observation = await prisma.weeklyObservation.findUnique({
      where: { weeklyTrackingId }
    })

    if (observation) {
      observation = await prisma.weeklyObservation.update({
        where: { weeklyTrackingId },
        data: { teacherNote }
      })
    } else {
      observation = await prisma.weeklyObservation.create({
        data: {
          weeklyTrackingId,
          teacherNote
        }
      })
    }

    return res.json(observation)
  } catch (error) {
    console.error('Error saveTeacherNote:', error)
    return res.status(500).json({ error: error.message })
  }
}

// GET ranking de alunos
export const getRanking = async (req, res) => {
  try {
    const ranking = await prisma.studentRanking.findMany({
      include: {
        student: {
          select: {
            id: true,
            name: true,
            profilePhoto: true,
            email: true
          }
        }
      },
      orderBy: [
        { totalPoints: 'desc' },
        { weeksCompleted: 'desc' }
      ]
    })

    // Adiciona posição
    const rankingWithPosition = ranking.map((item, index) => ({
      position: index + 1,
      ...item
    }))

    return res.json(rankingWithPosition)
  } catch (error) {
    console.error('Error getRanking:', error)
    return res.status(500).json({ error: error.message })
  }
}

// GET alunos para admin (com tracking)
export const getStudentsTracking = async (req, res) => {
  try {
    const students = await prisma.student.findMany({
      where: { role: 'STUDENT', status: 'APPROVED' },
      include: {
        weeklyTrackings: {
          include: {
            exercises: true,
            observation: true
          },
          orderBy: { weekNumber: 'asc' }
        },
        ranking: true
      }
    })

    return res.json(students)
  } catch (error) {
    console.error('Error getStudentsTracking:', error)
    return res.status(500).json({ error: error.message })
  }
}

// PUT foto do perfil do aluno
export const updateProfilePhoto = async (req, res) => {
  try {
    const { studentId } = req.params
    const { profilePhoto } = req.body

    const student = await prisma.student.update({
      where: { id: studentId },
      data: { profilePhoto }
    })

    return res.json(student)
  } catch (error) {
    console.error('Error updateProfilePhoto:', error)
    return res.status(500).json({ error: error.message })
  }
}

// ===== FUNÇÃO AUXILIAR =====
// Valida se a semana está completa e concede pontos
const checkWeekCompletion = async (weeklyTrackingId) => {
  try {
    const week = await prisma.weeklyTracking.findUnique({
      where: { id: weeklyTrackingId },
      include: { exercises: true }
    })

    if (!week || week.exercises.length === 0) return

    // Verifica se TODOS os exercícios têm peso e reps preenchidos
    const allFilled = week.exercises.every(ex => ex.weight && ex.reps)

    if (allFilled && !week.isCompleted) {
      // Marca como completa
      await prisma.weeklyTracking.update({
        where: { id: weeklyTrackingId },
        data: {
          isCompleted: true,
          completedAt: new Date()
        }
      })

      // Concede 100 pontos ao aluno
      const ranking = await prisma.studentRanking.findUnique({
        where: { studentId: week.studentId }
      })

      if (ranking) {
        await prisma.studentRanking.update({
          where: { id: ranking.id },
          data: {
            totalPoints: ranking.totalPoints + 100,
            weeksCompleted: ranking.weeksCompleted + 1
          }
        })
      } else {
        await prisma.studentRanking.create({
          data: {
            studentId: week.studentId,
            totalPoints: 100,
            weeksCompleted: 1
          }
        })
      }
    }
  } catch (error) {
    console.error('Error checkWeekCompletion:', error)
  }
}