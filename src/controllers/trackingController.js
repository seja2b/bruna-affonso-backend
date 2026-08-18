import { PrismaClient } from '@prisma/client'
import {
  getProgramFirstMonday,
  getWeekSchedule,
  serializeWeekCalendar,
  syncAutomaticWeekReleases
} from '../utils/weekSchedule.js'

const prisma = new PrismaClient()

async function getAuthenticatedStudent(userId) {
  return prisma.student.findUnique({ where: { userId }, select: { id: true } })
}

async function getAccessibleWeek(studentId, weekId) {
  return prisma.weeklyTracking.findFirst({
    where: { id: weekId, studentId, isReleased: true },
    include: { exercises: true, observation: true }
  })
}

async function ensureStudentWeeks(studentId) {
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
          isReleased: weekNumber === 1 && startDate <= new Date()
        }
      })
    }
  })
}

function normalizeExercises(exercises) {
  return exercises
    .map((exercise) => ({
      exerciseName: String(exercise.exerciseName || '').trim(),
      trainingType: String(exercise.trainingType || '').trim(),
      weight: String(exercise.weight || '').trim(),
      reps: String(exercise.reps || '').trim(),
      notes: String(exercise.notes || '').trim()
    }))
    .filter((exercise) => Object.values(exercise).some(Boolean))
}

function isExerciseComplete(exercise) {
  return Boolean(exercise.exerciseName && exercise.trainingType && exercise.weight && exercise.reps)
}

export async function getStudentWeeks(req, res) {
  try {
    const student = await getAuthenticatedStudent(req.user.userId)
    if (!student) return res.status(404).json({ error: 'Aluno não encontrado' })

    await ensureStudentWeeks(student.id)
    await syncAutomaticWeekReleases(prisma, student.id)

    const requestedWeekId = req.params.weekId
    if (requestedWeekId) {
      const week = await getAccessibleWeek(student.id, requestedWeekId)
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
    const week = await getAccessibleWeek(student.id, weekId)
    if (!week) return res.status(403).json({ error: 'Esta semana ainda não está liberada para preenchimento' })
    if (week.isCompleted) return res.status(409).json({ error: 'Esta semana já foi concluída' })

    const normalized = normalizeExercises(exercises)
    if (normalized.length > 30) return res.status(400).json({ error: 'Limite de 30 exercícios por semana' })

    await prisma.$transaction(async (tx) => {
      await tx.trackingExercise.deleteMany({ where: { weeklyTrackingId: weekId } })
      if (normalized.length > 0) {
        await tx.trackingExercise.createMany({
          data: normalized.map((exercise) => ({ weeklyTrackingId: weekId, ...exercise }))
        })
      }
    })

    return res.json({ message: 'Treino salvo com sucesso', exercises: normalized })
  } catch (error) {
    console.error('Error saveTrackingExercise:', error)
    return res.status(500).json({ error: 'Erro ao salvar exercícios' })
  }
}

export async function completeWeek(req, res) {
  try {
    const { weekId } = req.params
    const student = await getAuthenticatedStudent(req.user.userId)
    if (!student) return res.status(404).json({ error: 'Aluno não encontrado' })

    await syncAutomaticWeekReleases(prisma, student.id)
    const week = await getAccessibleWeek(student.id, weekId)
    if (!week) return res.status(403).json({ error: 'Esta semana ainda não está liberada' })

    if (week.isCompleted) {
      const ranking = await prisma.studentRanking.findUnique({ where: { studentId: student.id } })
      return res.json({ message: 'Semana já concluída', awardedPoints: 0, ranking })
    }

    if (week.exercises.length === 0) {
      return res.status(400).json({ error: 'Adicione pelo menos um exercício antes de concluir a semana' })
    }

    const incomplete = week.exercises.some((exercise) => !isExerciseComplete(exercise))
    if (incomplete) {
      return res.status(400).json({ error: 'Preencha exercício, tipo de treino, carga e repetições em todos os registros' })
    }

    const result = await prisma.$transaction(async (tx) => {
      const completed = await tx.weeklyTracking.updateMany({
        where: { id: weekId, studentId: student.id, isCompleted: false },
        data: { isCompleted: true, completedAt: new Date() }
      })

      if (completed.count === 0) {
        return { awardedPoints: 0, ranking: await tx.studentRanking.findUnique({ where: { studentId: student.id } }) }
      }

      const ranking = await tx.studentRanking.upsert({
        where: { studentId: student.id },
        create: { studentId: student.id, totalPoints: 100, weeksCompleted: 1 },
        update: { totalPoints: { increment: 100 }, weeksCompleted: { increment: 1 } }
      })

      return { awardedPoints: 100, ranking }
    })

    return res.json({ message: 'Semana concluída com sucesso', ...result })
  } catch (error) {
    console.error('Error completeWeek:', error)
    return res.status(500).json({ error: 'Erro ao concluir semana' })
  }
}

export async function saveStudentNote(req, res) {
  try {
    const { weekId, studentNote } = req.body
    if (!weekId) return res.status(400).json({ error: 'Semana é obrigatória' })

    const student = await getAuthenticatedStudent(req.user.userId)
    if (!student) return res.status(404).json({ error: 'Aluno não encontrado' })

    await syncAutomaticWeekReleases(prisma, student.id)
    const week = await getAccessibleWeek(student.id, weekId)
    if (!week) return res.status(403).json({ error: 'Esta semana ainda não está liberada para preenchimento' })

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
    const targetWeekId = req.params.weekId || req.body.weekId
    const { teacherNote } = req.body
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

    await ensureStudentWeeks(student.id)
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
    return res.json({ message: `Semana ${week.weekNumber} liberada manualmente com sucesso`, week: serializeWeekCalendar(week) })
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Semana não encontrada' })
    console.error('Error releaseWeekManually:', error)
    return res.status(500).json({ error: 'Erro ao liberar semana' })
  }
}

export async function getRanking(req, res) {
  try {
    const ranking = await prisma.studentRanking.findMany({
      include: { student: { include: { user: { select: { name: true, email: true, profilePhoto: true } } } } },
      orderBy: [{ totalPoints: 'desc' }, { updatedAt: 'asc' }]
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
        weeklyTrackings: { include: { exercises: true, observation: true }, orderBy: { weekNumber: 'asc' } },
        ranking: true
      }
    })

    return res.json(students.filter((student) => student.user.status === 'APPROVED').map((student) => ({
      id: student.id,
      userId: student.user.id,
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
    const student = await prisma.student.findUnique({ where: { id: studentId }, select: { userId: true } })

    if (!student || student.userId !== req.user.userId) return res.status(403).json({ error: 'Acesso negado' })
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
