import { PrismaClient } from '@prisma/client'
import {
  getProgramFirstMonday,
  getWeekSchedule,
  serializeWeekCalendar,
  syncAutomaticWeekReleases
} from '../utils/weekSchedule.js'
import { createNotification, createNotifications } from '../services/notificationService.js'

const prisma = new PrismaClient()

async function getAuthenticatedStudent(userId) {
  return prisma.student.findUnique({ where: { userId }, select: { id: true, userId: true } })
}

async function getAccessibleWeek(studentId, weekId) {
  return prisma.weeklyTracking.findFirst({
    where: { id: weekId, studentId, isReleased: true },
    include: { exercises: true, observation: true }
  })
}

async function ensureStudentWeeks(studentId) {
  const count = await prisma.weeklyTracking.count({ where: { studentId, trainingNumber: 1, weekNumber: { lte: 6 } } })
  if (count >= 6) {
    const programWorkout = await prisma.programWorkout.upsert({ where: { studentId_trainingNumber: { studentId, trainingNumber: 1 } }, update: {}, create: { studentId, trainingNumber: 1, title: 'Treino 01' } })
    await prisma.weeklyTracking.updateMany({ where: { studentId, trainingNumber: 1, weekNumber: { lte: 6 }, programWorkoutId: null }, data: { programWorkoutId: programWorkout.id } })
    return
  }
  const firstMonday = getProgramFirstMonday(new Date())
  await prisma.$transaction(async (tx) => {
    const programWorkout = await tx.programWorkout.upsert({
      where: { studentId_trainingNumber: { studentId, trainingNumber: 1 } },
      update: {},
      create: { studentId, trainingNumber: 1, title: 'Treino 01' }
    })
    for (let weekNumber = count + 1; weekNumber <= 6; weekNumber++) {
      const { startDate, endDate } = getWeekSchedule(firstMonday, weekNumber)
      await tx.weeklyTracking.create({
        data: {
          studentId,
          programWorkoutId: programWorkout.id,
          trainingNumber: 1,
          weekNumber,
          startDate,
          endDate,
          isReleased: weekNumber === 1 && startDate <= new Date()
        }
      })
    }
  })
}

async function syncReleasesAndNotify(student) {
  const newlyReleased = await syncAutomaticWeekReleases(prisma, student.id)

  if (newlyReleased.length > 0) {
    await createNotifications(prisma, newlyReleased.map((week) => ({
      userId: student.userId,
      title: `Semana ${week.weekNumber} liberada`,
      message: 'Sua nova semana de treino já está disponível para preenchimento.',
      type: 'WEEK_RELEASED'
    })))
  }

  return newlyReleased
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
    await syncReleasesAndNotify(student)

    const requestedWeekId = req.params.weekId
    if (requestedWeekId) {
      const week = await getAccessibleWeek(student.id, requestedWeekId)
      if (!week) return res.status(404).json({ error: 'Semana não encontrada ou ainda não liberada' })
      return res.json(serializeWeekCalendar(week))
    }

    const weeks = await prisma.weeklyTracking.findMany({
      where: { studentId: student.id, weekNumber: { lte: 6 } },
      include: { exercises: true, observation: true },
      orderBy: [{ trainingNumber: 'asc' }, { weekNumber: 'asc' }]
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

    await syncReleasesAndNotify(student)
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

    await syncReleasesAndNotify(student)
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

      const completedWeeks = await tx.weeklyTracking.count({ where: { studentId: student.id, trainingNumber: week.trainingNumber, weekNumber: { lte: 6 }, isCompleted: true } })
      let awardedPoints = 0
      let ranking = await tx.studentRanking.upsert({ where: { studentId: student.id }, create: { studentId: student.id, weeksCompleted: 1 }, update: { weeksCompleted: { increment: 1 } } })
      if (completedWeeks === 6) {
        const program = await tx.programWorkout.upsert({ where: { studentId_trainingNumber: { studentId: student.id, trainingNumber: week.trainingNumber } }, update: {}, create: { studentId: student.id, trainingNumber: week.trainingNumber, title: `Treino ${String(week.trainingNumber).padStart(2, '0')}` } })
        const award = await tx.programWorkout.updateMany({ where: { id: program.id, pointsAwarded: false }, data: { pointsAwarded: true } })
        if (award.count) {
          awardedPoints = 100
          ranking = await tx.studentRanking.update({ where: { studentId: student.id }, data: { totalPoints: { increment: 100 } } })
        }
      }

      await createNotification(tx, {
        userId: student.userId,
        title: `Semana ${week.weekNumber} concluída`,
        message: awardedPoints ? `Parabéns! Você concluiu as 6 semanas do Treino ${String(week.trainingNumber).padStart(2, '0')} e recebeu 100 pontos.` : 'Semana concluída. Continue até completar as 6 semanas deste treino.',
        type: 'WEEK_COMPLETED'
      })

      return { awardedPoints, ranking }
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

    await syncReleasesAndNotify(student)
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

    const week = await prisma.weeklyTracking.findUnique({
      where: { id: targetWeekId },
      include: { student: { select: { userId: true } } }
    })
    if (!week) return res.status(404).json({ error: 'Semana não encontrada' })

    const observation = await prisma.$transaction(async (tx) => {
      const saved = await tx.weeklyObservation.upsert({
        where: { weeklyTrackingId: targetWeekId },
        update: { teacherNote },
        create: { weeklyTrackingId: targetWeekId, teacherNote }
      })

      if (String(teacherNote || '').trim()) {
        await createNotification(tx, {
          userId: week.student.userId,
          title: `Novo feedback na semana ${week.weekNumber}`,
          message: 'A professora deixou uma nova observação sobre seus treinos desta semana.',
          type: 'TEACHER_FEEDBACK'
        })
      }

      return saved
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
    const student = await prisma.student.findUnique({ where: { id: studentId }, select: { id: true, userId: true } })
    if (!student) return res.status(404).json({ error: 'Aluno não encontrado' })

    await ensureStudentWeeks(student.id)
    await syncReleasesAndNotify(student)

    const weeks = await prisma.weeklyTracking.findMany({
      where: { studentId: student.id, weekNumber: { lte: 6 } },
      include: { exercises: true, observation: true },
      orderBy: [{ trainingNumber: 'asc' }, { weekNumber: 'asc' }]
    })

    return res.json(weeks.map(serializeWeekCalendar))
  } catch (error) {
    console.error('Error getAdminStudentWeeks:', error)
    return res.status(500).json({ error: 'Erro ao buscar semanas do aluno' })
  }
}

export async function createProgramWorkout(req, res) {
  try {
    const student = await prisma.student.findUnique({ where: { id: req.params.studentId }, include: { programWorkouts: true } })
    if (!student) return res.status(404).json({ error: 'Aluna não encontrada' })
    const limit = student.packageType === 'SEMIANNUAL' ? 4 : 2
    const trainingNumber = (student.programWorkouts.reduce((max, item) => Math.max(max, item.trainingNumber), 0) || 0) + 1
    if (trainingNumber > limit) return res.status(409).json({ error: `O plano permite no máximo ${limit} treinos` })
    const firstMonday = getProgramFirstMonday(req.body?.startDate ? new Date(req.body.startDate) : new Date())
    const workout = await prisma.$transaction(async (tx) => {
      const created = await tx.programWorkout.create({ data: { studentId: student.id, trainingNumber, title: `Treino ${String(trainingNumber).padStart(2, '0')}` } })
      for (let weekNumber = 1; weekNumber <= 6; weekNumber++) {
        const { startDate, endDate } = getWeekSchedule(firstMonday, weekNumber)
        await tx.weeklyTracking.create({ data: { studentId: student.id, programWorkoutId: created.id, trainingNumber, weekNumber, startDate, endDate, isReleased: weekNumber === 1 } })
      }
      return created
    })
    return res.status(201).json({ message: `${workout.title} criado com 6 semanas`, workout })
  } catch (error) { console.error('Error createProgramWorkout:', error); return res.status(500).json({ error: 'Erro ao criar treino' }) }
}

export async function updateAdminWeekDates(req, res) {
  try {
    const startDate = new Date(req.body?.startDate); const endDate = new Date(req.body?.endDate)
    if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime()) || endDate < startDate) return res.status(400).json({ error: 'Informe datas válidas' })
    const week = await prisma.weeklyTracking.update({ where: { id: req.params.weekId }, data: { startDate, endDate }, include: { exercises: true, observation: true } })
    return res.json({ message: 'Datas atualizadas', week: serializeWeekCalendar(week) })
  } catch (error) { console.error('Error updateAdminWeekDates:', error); return res.status(500).json({ error: 'Erro ao atualizar datas' }) }
}

export async function resetStudentProgram(req, res) {
  try {
    const student = await prisma.student.findUnique({ where: { id: req.params.studentId } })
    if (!student) return res.status(404).json({ error: 'Aluna não encontrada' })
    await prisma.$transaction([prisma.weeklyTracking.deleteMany({ where: { studentId: student.id } }), prisma.programWorkout.deleteMany({ where: { studentId: student.id } }), prisma.studentRanking.upsert({ where: { studentId: student.id }, create: { studentId: student.id }, update: { totalPoints: 0, weeksCompleted: 0 } })])
    await ensureStudentWeeks(student.id)
    return res.json({ message: 'Treinos e semanas reiniciados para a renovação' })
  } catch (error) { console.error('Error resetStudentProgram:', error); return res.status(500).json({ error: 'Erro ao reiniciar programa' }) }
}

export async function updateStudentPackage(req, res) {
  const packageType = String(req.body?.packageType || '').toUpperCase()
  if (!['QUARTERLY', 'SEMIANNUAL'].includes(packageType)) return res.status(400).json({ error: 'Plano inválido' })
  try { return res.json(await prisma.student.update({ where: { id: req.params.studentId }, data: { packageType } })) } catch { return res.status(404).json({ error: 'Aluna não encontrada' }) }
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
    const existing = await prisma.weeklyTracking.findUnique({
      where: { id: weekId },
      include: { student: { select: { userId: true } } }
    })
    if (!existing) return res.status(404).json({ error: 'Semana não encontrada' })

    const week = await prisma.$transaction(async (tx) => {
      const updated = await tx.weeklyTracking.update({
        where: { id: weekId },
        data: { isReleased: true },
        include: { exercises: true, observation: true }
      })

      if (!existing.isReleased) {
        await createNotification(tx, {
          userId: existing.student.userId,
          title: `Semana ${existing.weekNumber} liberada`,
          message: 'A professora antecipou a liberação desta semana. Você já pode preencher seus treinos.',
          type: 'WEEK_RELEASED_MANUAL'
        })
      }

      return updated
    })

    return res.json({ message: `Semana ${week.weekNumber} liberada manualmente com sucesso`, week: serializeWeekCalendar(week) })
  } catch (error) {
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
      packageType: student.packageType,
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
