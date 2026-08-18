import { PrismaClient } from '@prisma/client'
import {
  getProgramFirstMonday,
  getWeekSchedule,
  serializeWeekCalendar,
  syncAutomaticWeekReleases
} from '../utils/weekSchedule.js'

const prisma = new PrismaClient()

const defaultExercises = [
  { exerciseName: 'Supino Reto', trainingType: 'Força' },
  { exerciseName: 'Rosca Direta', trainingType: 'Força' },
  { exerciseName: 'Puxada Alta', trainingType: 'Força' },
  { exerciseName: 'Agachamento', trainingType: 'Força' },
  { exerciseName: 'Leg Press', trainingType: 'Força' }
]

async function getAuthenticatedStudent(userId) {
  return prisma.student.findUnique({
    where: { userId },
    select: { id: true }
  })
}

async function studentCanAccessWeek(studentId, weekId) {
  return prisma.weeklyTracking.findFirst({
    where: { id: weekId, studentId, isReleased: true },
    select: { id: true }
  })
}

async function ensureLegacyStudentWeeks(studentId) {
  const count = await prisma.weeklyTracking.count({ where: { studentId } })
  if (count > 0) return

  const firstMonday = getProgramFirstMonday(new Date())

  await prisma.$transaction(async (tx) => {
    for (let weekNumber = 1; weekNumber <= 52; weekNumber++) {
      const { startDate, endDate } = getWeekSchedule(firstMonday, weekNumber)
      await tx.weeklyTracking.create({
        data: {
          studentId,
          weekNumber,
          startDate,
          endDate,
          isReleased: weekNumber === 1 && startDate <= new Date(),
          exercises: { create: defaultExercises }
        }
      })
    }
  })
}

export async function getStudentWeeks(req, res) {
  try {
    const student = await getAuthenticatedStudent(req.user.userId)
    if (!student) return res.status(404).json({ error: 'Aluno não encontrado' })

    await ensureLegacyStudentWeeks(student.id)
    await syncAutomaticWeekReleases(prisma, student.id)

    const requestedWeekId = req.params.weekId
    if (requestedWeekId) {
      const week = await prisma.weeklyTracking.findFirst({
        where: { id: requestedWeekId, studentId: student.id, isReleased: true },
        include: { exercises: true, observation: true }
      })
      if (!week) return res.status(404).json({ error: 'Semana não encontrada ou ainda não liberada' })
      return res.json(serializeWeekCalendar(week))
    }

    const weeks = await prisma.weeklyTracking.findMany({
      where: { studentId: student.id },
      include: { exercises: true, observation: true },
      orderBy: { weekNumber: 'asc' }
    })

    return res.json(weeks.map(serializeWeekCalendar))
  } catch (error) {
    console.error('Error getStudentWeeks:', error)
    return res.status(500).json({ error: 'Erro ao buscar semanas' })
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

    await syncAutomaticWeekReleases(prisma, student.id)
    if (!await studentCanAccessWeek(student.id, weekId)) {
      return res.status(403).json({ error: 'Esta semana ainda não está liberada para preenchimento' })
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

    return res.json({ message: 'Exercícios salvos com sucesso' })
  } catch (error) {
    console.error('Error saveTrackingExercise:', error)
    return res.status(500).json({ error: 'Erro ao salvar exercícios' })
  }
}

export async function saveStudentNote(req, res) {
  try {
    const { weekId, studentNote } = req.body
    if (!weekId) return res.status(400).json({ error: 'Semana é obrigatória' })

    const student = await getAuthenticatedStudent(req.user.userId)
    if (!student) return res.status(404).json({ error: 'Aluno não encontrado' })

    await syncAutomaticWeekReleases(prisma, student.id)
    if (!await studentCanAccessWeek(student.id, weekId)) {
      return res.status(403).json({ error: 'Esta semana ainda não está liberada para preenchimento' })
    }

    const observation = await prisma.weeklyObservation.upsert({
      where: { weeklyTrackingId: weekId },
      update: { studentNote },
      create: { weeklyTrackingId: weekId, studentNote }
    })

    return res.json({ message: 'Observação salva com sucesso', observation })
  } catch (error) {
    console.error('Error saveStudentNote:', error)
    return res.status(500).json({ error: 'Erro ao salvar observação' })
  }
}

export async function saveTeacherNote(req, res) {
  try {
    const { weekId, teacherNote } = req.body
    const routeWeekId = req.params.weekId
    const targetWeekId = routeWeekId || weekId
    if (!targetWeekId) return res.status(400).json({ error: 'Semana é obrigatória' })

    const week = await prisma.weeklyTracking.findUnique({ where: { id: targetWeekId }, select: { id: true } })
    if (!week) return res.status(404).json({ error: 'Semana não encontrada' })

    const observation = await prisma.weeklyObservation.upsert({
      where: { weeklyTrackingId: targetWeekId },
      update: { teacherNote },
      create: { weeklyTrackingId: targetWeekId, teacherNote }
    })

    return res.json({ message: 'Observação da professora salva', observation })
  } catch (error) {
    console.error('Error saveTeacherNote:', error)
    return res.status(500).json({ error: 'Erro ao salvar observação' })
  }
}

export async function getAdminStudentWeeks(req, res) {
  try {
    const { studentId } = req.params
    const student = await prisma.student.findUnique({ where: { id: studentId }, select: { id: true } })
    if (!student) return res.status(404).json({ error: 'Aluno não encontrado' })

    await ensureLegacyStudentWeeks(student.id)
    await syncAutomaticWeekReleases(prisma, student.id)

    const weeks = await prisma.weeklyTracking.findMany({
      where: { studentId: student.id },
      include: { exercises: true, observation: true },
      orderBy: { weekNumber: 'asc' }
    })

    return res.json(weeks.map(serializeWeekCalendar))
  } catch (error) {
    console.error('Error getAdminStudentWeeks:', error)
    return res.status(500).json({ error: 'Erro ao buscar semanas do aluno' })
  }
}

export async function getAdminWeek(req, res) {
  try {
    const { weekId } = req.params
    const week = await prisma.weeklyTracking.findUnique({
      where: { id: weekId },
      include: {
        exercises: true,
        observation: true,
        student: { include: { user: { select: { id: true, name: true, email: true, profilePhoto: true } } } }
      }
    })

    if (!week) return res.status(404).json({ error: 'Semana não encontrada' })
    return res.json(serializeWeekCalendar(week))
  } catch (error) {
    console.error('Error getAdminWeek:', error)
    return res.status(500).json({ error: 'Erro ao buscar semana' })
  }
}

export async function releaseWeekManually(req, res) {
  try {
    const { weekId } = req.params
    const week = await prisma.weeklyTracking.update({
      where: { id: weekId },
      data: { isReleased: true },
      include: { exercises: true, observation: true }
    })

    return res.json({
      message: `Semana ${week.weekNumber} liberada manualmente com sucesso`,
      week: serializeWeekCalendar(week)
    })
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Semana não encontrada' })
    console.error('Error releaseWeekManually:', error)
    return res.status(500).json({ error: 'Erro ao liberar semana' })
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
    return res.json(ranking)
  } catch (error) {
    console.error('Error getRanking:', error)
    return res.status(500).json({ error: 'Erro ao buscar ranking' })
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

    return res.json(students
      .filter((student) => student.user.status === 'APPROVED')
      .map((student) => ({
        id: student.id,
        name: student.user.name,
        email: student.user.email,
        profilePhoto: student.user.profilePhoto,
        weeklyTrackings: student.weeklyTrackings.map(serializeWeekCalendar),
        ranking: student.ranking
      })))
  } catch (error) {
    console.error('Error getStudentsTracking:', error)
    return res.status(500).json({ error: 'Erro ao buscar alunos' })
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

    return res.json({ message: 'Foto salva com sucesso', user })
  } catch (error) {
    console.error('Error updateProfilePhoto:', error)
    return res.status(500).json({ error: 'Erro ao salvar foto' })
  }
}
