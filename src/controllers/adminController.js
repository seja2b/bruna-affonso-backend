import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const defaultTrackingExercises = [
  { exerciseName: 'Supino Reto', trainingType: 'Força' },
  { exerciseName: 'Rosca Direta', trainingType: 'Força' },
  { exerciseName: 'Puxada Alta', trainingType: 'Força' },
  { exerciseName: 'Agachamento', trainingType: 'Força' },
  { exerciseName: 'Leg Press', trainingType: 'Força' }
]

async function ensureStudentWeeks(tx, studentId) {
  const existingWeeks = await tx.weeklyTracking.count({ where: { studentId } })
  if (existingWeeks > 0) return

  const startDate = new Date()
  for (let weekNumber = 1; weekNumber <= 52; weekNumber++) {
    const startDateForWeek = new Date(startDate)
    startDateForWeek.setDate(startDate.getDate() + (weekNumber - 1) * 7)
    const endDateForWeek = new Date(startDateForWeek)
    endDateForWeek.setDate(startDateForWeek.getDate() + 6)

    await tx.weeklyTracking.create({
      data: {
        studentId,
        weekNumber,
        startDate: startDateForWeek,
        endDate: endDateForWeek,
        isReleased: weekNumber === 1,
        exercises: {
          create: defaultTrackingExercises
        }
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
        createdAt: true
      },
      orderBy: { createdAt: 'desc' }
    })
    return res.json(students)
  } catch (error) {
    console.error('Erro ao buscar alunos:', error)
    return res.status(500).json({ error: 'Erro ao buscar alunos' })
  }
}

export async function getStudentDetails(req, res) {
  try {
    const { studentId } = req.params
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

    if (!user || !user.student) {
      return res.status(404).json({ error: 'Aluno não encontrado' })
    }

    const weeks = user.student.weeklyTrackings
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
      if (student) await ensureStudentWeeks(tx, student.id)

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
