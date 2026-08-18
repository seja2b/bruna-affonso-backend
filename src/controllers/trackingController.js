import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function getAuthenticatedStudent(userId) {
  return prisma.student.findUnique({
    where: { userId },
    select: { id: true }
  })
}

async function studentOwnsWeek(studentId, weekId) {
  return prisma.weeklyTracking.findFirst({
    where: { id: weekId, studentId },
    select: { id: true }
  })
}

export async function getStudentWeeks(req, res) {
  try {
    const student = await getAuthenticatedStudent(req.user.userId)
    if (!student) return res.status(404).json({ error: 'Aluno não encontrado' })

    const requestedWeekId = req.params.weekId
    if (requestedWeekId) {
      const week = await prisma.weeklyTracking.findFirst({
        where: { id: requestedWeekId, studentId: student.id },
        include: { exercises: true, observation: true }
      })
      if (!week) return res.status(404).json({ error: 'Semana não encontrada' })
      return res.json(week)
    }

    let weeks = await prisma.weeklyTracking.findMany({
      where: { studentId: student.id },
      include: { exercises: true, observation: true },
      orderBy: { weekNumber: 'asc' }
    })

    if (weeks.length === 0) {
      const startDate = new Date()
      const defaultExercises = [
        { exerciseName: 'Supino Reto', trainingType: 'Força' },
        { exerciseName: 'Rosca Direta', trainingType: 'Força' },
        { exerciseName: 'Puxada Alta', trainingType: 'Força' },
        { exerciseName: 'Agachamento', trainingType: 'Força' },
        { exerciseName: 'Leg Press', trainingType: 'Força' }
      ]

      await prisma.$transaction(async (tx) => {
        for (let i = 1; i <= 52; i++) {
          const weekStart = new Date(startDate)
          weekStart.setDate(weekStart.getDate() + (i - 1) * 7)
          const weekEnd = new Date(weekStart)
          weekEnd.setDate(weekEnd.getDate() + 6)

          await tx.weeklyTracking.create({
            data: {
              studentId: student.id,
              weekNumber: i,
              startDate: weekStart,
              endDate: weekEnd,
              isReleased: i === 1,
              isCompleted: false,
              exercises: {
                create: defaultExercises.map((exercise) => ({
                  ...exercise,
                  weight: null,
                  reps: null
                }))
              }
            }
          })
        }
      })

      weeks = await prisma.weeklyTracking.findMany({
        where: { studentId: student.id },
        include: { exercises: true, observation: true },
        orderBy: { weekNumber: 'asc' }
      })
    }

    res.json(weeks)
  } catch (error) {
    console.error('Error getStudentWeeks:', error)
    res.status(500).json({ error: 'Erro ao buscar semanas' })
  }
}

export async function saveTrackingExercise(req, res) {
  try {
    const { weekId, exercises } = req.body
    if (!weekId || !Array.isArray(exercises)) {
      return res.status(400).json({ error: 'Semana e exercícios são obrigatórios' })
    }

    const student = await getAuthenticatedStudent(req.user.userId)
    if (!student) return res.status(404).json({ error: 'Aluno não encontrado' })
    if (!await studentOwnsWeek(student.id, weekId)) {
      return res.status(403).json({ error: 'Acesso negado a esta semana' })
    }

    await prisma.$transaction(async (tx) => {
      await tx.trackingExercise.deleteMany({ where: { weeklyTrackingId: weekId } })
      if (exercises.length > 0) {
        await tx.trackingExercise.createMany({
          data: exercises.map((exercise) => ({
            weeklyTrackingId: weekId,
            exerciseName: exercise.exerciseName,
            trainingType: exercise.trainingType,
            weight: exercise.weight || null,
            reps: exercise.reps || null,
            notes: exercise.notes || null
          }))
        })
      }
    })

    res.json({ message: 'Exercícios salvos com sucesso' })
  } catch (error) {
    console.error('Error saveTrackingExercise:', error)
    res.status(500).json({ error: 'Erro ao salvar exercícios' })
  }
}

export async function saveStudentNote(req, res) {
  try {
    const { weekId, studentNote } = req.body
    if (!weekId) return res.status(400).json({ error: 'Semana é obrigatória' })

    const student = await getAuthenticatedStudent(req.user.userId)
    if (!student) return res.status(404).json({ error: 'Aluno não encontrado' })
    if (!await studentOwnsWeek(student.id, weekId)) {
      return res.status(403).json({ error: 'Acesso negado a esta semana' })
    }

    const observation = await prisma.weeklyObservation.upsert({
      where: { weeklyTrackingId: weekId },
      update: { studentNote },
      create: { weeklyTrackingId: weekId, studentNote }
    })

    res.json({ message: 'Observação salva com sucesso', observation })
  } catch (error) {
    console.error('Error saveStudentNote:', error)
    res.status(500).json({ error: 'Erro ao salvar observação' })
  }
}

export async function saveTeacherNote(req, res) {
  try {
    const { weekId, teacherNote } = req.body
    if (!weekId) return res.status(400).json({ error: 'Semana é obrigatória' })

    const week = await prisma.weeklyTracking.findUnique({ where: { id: weekId }, select: { id: true } })
    if (!week) return res.status(404).json({ error: 'Semana não encontrada' })

    const observation = await prisma.weeklyObservation.upsert({
      where: { weeklyTrackingId: weekId },
      update: { teacherNote },
      create: { weeklyTrackingId: weekId, teacherNote }
    })

    res.json({ message: 'Observação da professora salva', observation })
  } catch (error) {
    console.error('Error saveTeacherNote:', error)
    res.status(500).json({ error: 'Erro ao salvar observação' })
  }
}

export async function getRanking(req, res) {
  try {
    const ranking = await prisma.studentRanking.findMany({
      include: {
        student: {
          include: {
            user: { select: { name: true, email: true, profilePhoto: true } }
          }
        }
      },
      orderBy: { totalPoints: 'desc' }
    })
    res.json(ranking)
  } catch (error) {
    console.error('Error getRanking:', error)
    res.status(500).json({ error: 'Erro ao buscar ranking' })
  }
}

export async function getStudentsTracking(req, res) {
  try {
    const students = await prisma.student.findMany({
      include: {
        user: { select: { id: true, email: true, name: true, status: true, profilePhoto: true } },
        weeklyTrackings: {
          include: { exercises: true, observation: true },
          orderBy: { weekNumber: 'asc' }
        },
        ranking: true
      }
    })

    res.json(students
      .filter((student) => student.user.status === 'APPROVED')
      .map((student) => ({
        id: student.id,
        name: student.user.name,
        email: student.user.email,
        profilePhoto: student.user.profilePhoto,
        weeklyTrackings: student.weeklyTrackings,
        ranking: student.ranking
      })))
  } catch (error) {
    console.error('Error getStudentsTracking:', error)
    res.status(500).json({ error: 'Erro ao buscar alunos' })
  }
}

export async function updateProfilePhoto(req, res) {
  try {
    const { studentId } = req.params
    const { profilePhoto } = req.body
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: { userId: true }
    })

    if (!student || student.userId !== req.user.userId) {
      return res.status(403).json({ error: 'Acesso negado' })
    }

    if (typeof profilePhoto !== 'string' || profilePhoto.length > 5_000_000) {
      return res.status(400).json({ error: 'Foto de perfil inválida ou muito grande' })
    }

    const user = await prisma.user.update({
      where: { id: req.user.userId },
      data: { profilePhoto },
      select: { id: true, name: true, email: true, profilePhoto: true }
    })

    res.json({ message: 'Foto salva com sucesso', user })
  } catch (error) {
    console.error('Error updateProfilePhoto:', error)
    res.status(500).json({ error: 'Erro ao salvar foto' })
  }
}
