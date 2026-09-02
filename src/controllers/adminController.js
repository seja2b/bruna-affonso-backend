import { PrismaClient } from '@prisma/client'
import {
  getProgramFirstMonday,
  getWeekSchedule,
  serializeWeekCalendar,
  syncAutomaticWeekReleases
} from '../utils/weekSchedule.js'

const prisma = new PrismaClient()

async function ensureStudentWeeks(tx, studentId) {
  const existingWeeks = await tx.weeklyTracking.count({ where: { studentId } })
  if (existingWeeks > 0) return

  const firstMonday = getProgramFirstMonday(new Date())

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
}

export async function getDashboard(req, res) {
  try {
    const [totalStudents, pendingStudents, totalWorkouts, pendingQuestions] = await Promise.all([
      prisma.user.count({ where: { role: 'STUDENT', status: 'APPROVED' } }),
      prisma.user.count({ where: { role: 'STUDENT', status: 'PENDING' } }),
      prisma.workout.count(),
      prisma.question.count({ where: { status: 'PENDING' } })
    ])

    return res.json({ totalStudents, pendingStudents, totalWorkouts, pendingQuestions })
  } catch (error) {
    console.error('Erro ao buscar dashboard:', error)
    return res.status(500).json({ error: 'Erro ao buscar dashboard' })
  }
}

export async function getStudents(req, res) {
  try {
    const students = await prisma.user.findMany({
      where: { role: 'STUDENT' },
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        phone: true,
        profilePhoto: true,
        createdAt: true,
        student: { select: { id: true } }
      },
      orderBy: { createdAt: 'desc' }
    })

    return res.json(students.map(({ student, ...user }) => ({
      ...user,
      studentId: student?.id || null
    })))
  } catch (error) {
    console.error('Erro ao buscar alunos:', error)
    return res.status(500).json({ error: 'Erro ao buscar alunos' })
  }
}

export async function getStudentDetails(req, res) {
  try {
    const { studentId } = req.params
    const baseUser = await prisma.user.findFirst({
      where: { id: studentId, role: 'STUDENT' },
      select: { student: { select: { id: true } } }
    })

    if (!baseUser?.student) return res.status(404).json({ error: 'Aluno não encontrado' })

    await syncAutomaticWeekReleases(prisma, baseUser.student.id)

    const user = await prisma.user.findFirst({
      where: { id: studentId, role: 'STUDENT' },
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        phone: true,
        profilePhoto: true,
        createdAt: true,
        student: {
          select: {
            id: true,
            weeklyTrackings: {
              include: { exercises: true, observation: true },
              orderBy: { weekNumber: 'asc' }
            },
            ranking: true,
            questions: {
              include: { answer: true },
              orderBy: { createdAt: 'desc' }
            },
            workouts: {
              include: { workout: true },
              orderBy: { createdAt: 'desc' }
            }
          }
        }
      }
    })

    const weeks = user.student.weeklyTrackings.map(serializeWeekCalendar)
    const completedWeeks = weeks.filter((week) => week.isCompleted).length
    const releasedWeeks = weeks.filter((week) => week.isReleased).length

    return res.json({
      id: user.id,
      studentId: user.student.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      status: user.status,
      profilePhoto: user.profilePhoto,
      createdAt: user.createdAt,
      metrics: {
        totalWeeks: weeks.length,
        completedWeeks,
        releasedWeeks,
        totalPoints: user.student.ranking?.totalPoints || 0,
        weeksCompleted: user.student.ranking?.weeksCompleted || completedWeeks,
        totalQuestions: user.student.questions.length,
        pendingQuestions: user.student.questions.filter((question) => question.status === 'PENDING').length,
        assignedWorkouts: user.student.workouts.length,
        completedWorkouts: user.student.workouts.filter((item) => item.completed).length
      },
      weeks,
      ranking: user.student.ranking,
      questions: user.student.questions,
      workouts: user.student.workouts
    })
  } catch (error) {
    console.error('Erro ao buscar detalhe do aluno:', error)
    return res.status(500).json({ error: 'Erro ao buscar detalhe do aluno' })
  }
}

export async function approveStudent(req, res) {
  try {
    const { studentId } = req.params

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findFirst({ where: { id: studentId, role: 'STUDENT' } })
      if (!user) return null

      const updatedUser = await tx.user.update({
        where: { id: studentId },
        data: { status: 'APPROVED' }
      })

      const student = await tx.student.findUnique({ where: { userId: studentId } })
      if (student) {
        await ensureStudentWeeks(tx, student.id)
        await tx.assessmentCycle.upsert({
          where: { studentId_sequence: { studentId: student.id, sequence: 0 } },
          update: {},
          create: {
            studentId: student.id,
            deadlineAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            stageStatuses: { ANAMNESIS: 'PENDING', BODY: 'PENDING', POSTURAL: 'PENDING', STRENGTH: 'PENDING', ENDURANCE: 'PENDING' }
          }
        })
      }

      return updatedUser
    })

    if (!result) return res.status(404).json({ error: 'Aluno não encontrado' })
    return res.json({ message: 'Aluno aprovado com sucesso', user: result })
  } catch (error) {
    console.error('Erro ao aprovar aluno:', error)
    return res.status(500).json({ error: 'Erro ao aprovar aluno' })
  }
}

export async function rejectStudent(req, res) {
  try {
    const { studentId } = req.params
    const student = await prisma.user.update({ where: { id: studentId }, data: { status: 'REJECTED' } })
    return res.json({ message: 'Aluno rejeitado', student })
  } catch (error) {
    console.error('Erro ao rejeitar aluno:', error)
    return res.status(500).json({ error: 'Erro ao rejeitar aluno' })
  }
}

export async function deactivateStudent(req, res) {
  try {
    const { studentId } = req.params
    const student = await prisma.user.update({ where: { id: studentId }, data: { status: 'INACTIVE' } })
    return res.json({ message: 'Aluno inativado', student })
  } catch (error) {
    console.error('Erro ao inativar aluno:', error)
    return res.status(500).json({ error: 'Erro ao inativar aluno' })
  }
}

export async function reactivateStudent(req, res) {
  try {
    const { studentId } = req.params
    const student = await prisma.user.update({ where: { id: studentId }, data: { status: 'APPROVED' } })
    return res.json({ message: 'Aluno reativado', student })
  } catch (error) {
    console.error('Erro ao reativar aluno:', error)
    return res.status(500).json({ error: 'Erro ao reativar aluno' })
  }
}

export async function getCategories(req, res) {
  try {
    return res.json(await prisma.category.findMany())
  } catch (error) {
    console.error('Erro ao buscar categorias:', error)
    return res.status(500).json({ error: 'Erro ao buscar categorias' })
  }
}

export async function createCategory(req, res) {
  try {
    const { name, description } = req.body
    if (!name?.trim()) return res.status(400).json({ error: 'Nome da categoria é obrigatório' })
    const category = await prisma.category.create({ data: { name: name.trim(), description } })
    return res.status(201).json(category)
  } catch (error) {
    console.error('Erro ao criar categoria:', error)
    return res.status(500).json({ error: 'Erro ao criar categoria' })
  }
}

export async function createWorkoutAdmin(req, res) {
  try {
    const { title, description, categoryId, videoUrl, week, module, coverImage, status } = req.body
    const workout = await prisma.workout.create({
      data: { title, description, categoryId, videoUrl, week, module, coverImage, status }
    })
    return res.status(201).json(workout)
  } catch (error) {
    console.error('Erro ao criar treino:', error)
    return res.status(500).json({ error: 'Erro ao criar treino' })
  }
}

export async function updateWorkoutAdmin(req, res) {
  try {
    const { workoutId } = req.params
    const { title, description, categoryId, videoUrl, week, module, coverImage, status } = req.body
    const workout = await prisma.workout.update({
      where: { id: workoutId },
      data: { title, description, categoryId, videoUrl, week, module, coverImage, status }
    })
    return res.json(workout)
  } catch (error) {
    console.error('Erro ao atualizar treino:', error)
    return res.status(500).json({ error: 'Erro ao atualizar treino' })
  }
}

export async function deleteWorkoutAdmin(req, res) {
  try {
    const { workoutId } = req.params
    await prisma.workout.delete({ where: { id: workoutId } })
    return res.json({ message: 'Treino deletado' })
  } catch (error) {
    console.error('Erro ao deletar treino:', error)
    return res.status(500).json({ error: 'Erro ao deletar treino' })
  }
}

export async function getPendingQuestions(req, res) {
  try {
    const questions = await prisma.question.findMany({
      where: { status: 'PENDING' },
      include: { user: { select: { id: true, name: true, email: true, profilePhoto: true } } },
      orderBy: { createdAt: 'asc' }
    })
    return res.json(questions)
  } catch (error) {
    console.error('Erro ao buscar perguntas:', error)
    return res.status(500).json({ error: 'Erro ao buscar perguntas' })
  }
}

export async function answerQuestion(req, res) {
  try {
    const { questionId } = req.params
    const { text } = req.body
    if (!text?.trim()) return res.status(400).json({ error: 'Resposta é obrigatória' })

    const answer = await prisma.$transaction(async (tx) => {
      const savedAnswer = await tx.answer.upsert({
        where: { questionId },
        update: { text: text.trim() },
        create: { questionId, text: text.trim() }
      })
      await tx.question.update({ where: { id: questionId }, data: { status: 'ANSWERED' } })
      return savedAnswer
    })

    return res.status(201).json(answer)
  } catch (error) {
    console.error('Erro ao responder pergunta:', error)
    return res.status(500).json({ error: 'Erro ao responder pergunta' })
  }
}

export async function getSettings(req, res) {
  try {
    let settings = await prisma.adminSettings.findFirst()
    if (!settings) settings = await prisma.adminSettings.create({ data: {} })
    return res.json(settings)
  } catch (error) {
    console.error('Erro ao buscar configurações:', error)
    return res.status(500).json({ error: 'Erro ao buscar configurações' })
  }
}

export async function updateSettings(req, res) {
  try {
    const { phone, whatsappUrl, motivationalPhrase, profileImage, logo } = req.body
    let settings = await prisma.adminSettings.findFirst()
    if (!settings) {
      settings = await prisma.adminSettings.create({ data: { phone, whatsappUrl, motivationalPhrase, profileImage, logo } })
    } else {
      settings = await prisma.adminSettings.update({
        where: { id: settings.id },
        data: { phone, whatsappUrl, motivationalPhrase, profileImage, logo }
      })
    }
    return res.json(settings)
  } catch (error) {
    console.error('Erro ao atualizar configurações:', error)
    return res.status(500).json({ error: 'Erro ao atualizar configurações' })
  }
}

const administratorSelect = {
  id: true,
  name: true,
  email: true,
  status: true,
  profilePhoto: true,
  createdAt: true,
  updatedAt: true
}

export async function getAdministrators(req, res) {
  try {
    const administrators = await prisma.user.findMany({
      where: { role: 'ADMIN' },
      select: administratorSelect,
      orderBy: [{ name: 'asc' }, { email: 'asc' }]
    })

    return res.json({ administrators, currentUserId: req.user.userId })
  } catch (error) {
    console.error('Erro ao buscar administradores:', error)
    return res.status(500).json({ error: 'Erro ao buscar administradores' })
  }
}

export async function getAdministratorCandidates(req, res) {
  try {
    const query = typeof req.query.q === 'string' ? req.query.q.trim() : ''
    const candidates = await prisma.user.findMany({
      where: {
        role: 'STUDENT',
        ...(query ? {
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { email: { contains: query, mode: 'insensitive' } }
          ]
        } : {})
      },
      select: administratorSelect,
      orderBy: [{ name: 'asc' }, { email: 'asc' }],
      take: 30
    })

    return res.json(candidates)
  } catch (error) {
    console.error('Erro ao buscar candidatos a administrador:', error)
    return res.status(500).json({ error: 'Erro ao buscar contas elegíveis' })
  }
}

export async function promoteAdministrator(req, res) {
  try {
    const { userId } = req.params
    const promoted = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true, role: true } })
      if (!user) return { status: 404, error: 'Conta não encontrada' }
      if (user.role === 'ADMIN') return { status: 409, error: 'Esta conta já é administradora' }
      if (user.role !== 'STUDENT') return { status: 400, error: 'Apenas contas de alunas podem ser promovidas' }

      await tx.admin.upsert({
        where: { userId },
        update: {},
        create: { userId }
      })
      const administrator = await tx.user.update({
        where: { id: userId },
        data: { role: 'ADMIN', status: 'APPROVED' },
        select: administratorSelect
      })
      return { administrator }
    })

    if (promoted.error) return res.status(promoted.status).json({ error: promoted.error })
    return res.json({ message: 'Acesso administrativo concedido com sucesso', administrator: promoted.administrator })
  } catch (error) {
    console.error('Erro ao promover administrador:', error)
    return res.status(500).json({ error: 'Erro ao conceder acesso administrativo' })
  }
}

export async function removeAdministrator(req, res) {
  try {
    const { userId } = req.params
    if (userId === req.user.userId) {
      return res.status(400).json({ error: 'Peça para outro administrador remover o seu acesso' })
    }

    const removed = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true, role: true } })
      if (!user || user.role !== 'ADMIN') return { status: 404, error: 'Administrador não encontrado' }

      const administratorCount = await tx.user.count({ where: { role: 'ADMIN' } })
      if (administratorCount <= 1) return { status: 409, error: 'O último administrador não pode ser removido' }

      await tx.student.upsert({
        where: { userId },
        update: {},
        create: { userId }
      })
      await tx.admin.deleteMany({ where: { userId } })
      const student = await tx.user.update({
        where: { id: userId },
        data: { role: 'STUDENT', status: 'APPROVED' },
        select: administratorSelect
      })
      return { student }
    }, { isolationLevel: 'Serializable' })

    if (removed.error) return res.status(removed.status).json({ error: removed.error })
    return res.json({ message: 'Acesso administrativo removido com sucesso', user: removed.student })
  } catch (error) {
    console.error('Erro ao remover administrador:', error)
    return res.status(500).json({ error: 'Erro ao remover acesso administrativo' })
  }
}
