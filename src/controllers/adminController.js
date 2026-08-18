import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// DASHBOARD
export async function getDashboard(req, res) {
  try {
    const userId = req.user.userId
    const user = await prisma.user.findUnique({ where: { id: userId } })
    
    if (user?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Apenas admin' })
    }

    const totalStudents = await prisma.user.count({ where: { role: 'STUDENT', status: 'APPROVED' } })
    const pendingStudents = await prisma.user.count({ where: { role: 'STUDENT', status: 'PENDING' } })
    const totalWorkouts = await prisma.workout.count()
    const pendingQuestions = await prisma.question.count({ where: { status: 'PENDING' } })

    return res.json({
      totalStudents,
      pendingStudents,
      totalWorkouts,
      pendingQuestions
    })
  } catch (error) {
    console.error('Erro ao buscar dashboard:', error)
    return res.status(500).json({ error: 'Erro ao buscar dashboard' })
  }
}

// ALUNOS
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

export async function approveStudent(req, res) {
  try {
    const userId = req.user.userId
    const user = await prisma.user.findUnique({ where: { id: userId } })
    
    if (user?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Apenas admin' })
    }

    const { studentId } = req.params
    
    const updatedUser = await prisma.user.update({
      where: { id: studentId },
      data: { status: 'APPROVED' }
    })

    // Criar 52 semanas se não existir
    const student = await prisma.student.findUnique({
      where: { userId: studentId }
    })

    if (student) {
      const existingWeeks = await prisma.week.count({
        where: { studentId: student.id }
      })

      if (existingWeeks === 0) {
        const defaultExercises = [
          { exerciseName: 'Supino Reto', trainingType: 'Força' },
          { exerciseName: 'Rosca Direta', trainingType: 'Força' },
          { exerciseName: 'Puxada Alta', trainingType: 'Força' },
          { exerciseName: 'Agachamento', trainingType: 'Força' },
          { exerciseName: 'Leg Press', trainingType: 'Força' }
        ]

        for (let i = 1; i <= 52; i++) {
          await prisma.week.create({
            data: {
              weekNumber: i,
              studentId: student.id,
              isReleased: i === 1,
              exercises: {
                create: defaultExercises
              }
            }
          })
        }
      }
    }

    return res.json({ message: 'Aluno aprovado com sucesso', user: updatedUser })
  } catch (error) {
    console.error('Erro ao aprovar aluno:', error)
    return res.status(500).json({ error: 'Erro ao aprovar aluno' })
  }
}

export async function rejectStudent(req, res) {
  try {
    const userId = req.user.userId
    const user = await prisma.user.findUnique({ where: { id: userId } })
    
    if (user?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Apenas admin' })
    }

    const { studentId } = req.params
    const student = await prisma.user.update({
      where: { id: studentId },
      data: { status: 'REJECTED' }
    })

    return res.json({ message: 'Aluno rejeitado', student })
  } catch (error) {
    console.error('Erro ao rejeitar aluno:', error)
    return res.status(500).json({ error: 'Erro ao rejeitar aluno' })
  }
}

export async function deactivateStudent(req, res) {
  try {
    const userId = req.user.userId
    const user = await prisma.user.findUnique({ where: { id: userId } })
    
    if (user?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Apenas admin' })
    }

    const { studentId } = req.params
    const student = await prisma.user.update({
      where: { id: studentId },
      data: { status: 'INACTIVE' }
    })

    return res.json({ message: 'Aluno inativado', student })
  } catch (error) {
    console.error('Erro ao inativar aluno:', error)
    return res.status(500).json({ error: 'Erro ao inativar aluno' })
  }
}

export async function reactivateStudent(req, res) {
  try {
    const userId = req.user.userId
    const user = await prisma.user.findUnique({ where: { id: userId } })
    
    if (user?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Apenas admin' })
    }

    const { studentId } = req.params
    const student = await prisma.user.update({
      where: { id: studentId },
      data: { status: 'APPROVED' }
    })

    return res.json({ message: 'Aluno reativado', student })
  } catch (error) {
    console.error('Erro ao reativar aluno:', error)
    return res.status(500).json({ error: 'Erro ao reativar aluno' })
  }
}

// CATEGORIAS
export async function getCategories(req, res) {
  try {
    const categories = await prisma.category.findMany()
    return res.json(categories)
  } catch (error) {
    console.error('Erro ao buscar categorias:', error)
    return res.status(500).json({ error: 'Erro ao buscar categorias' })
  }
}

export async function createCategory(req, res) {
  try {
    const userId = req.user.userId
    const user = await prisma.user.findUnique({ where: { id: userId } })
    
    if (user?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Apenas admin' })
    }

    const { name, description } = req.body
    const category = await prisma.category.create({
      data: { name, description }
    })

    return res.status(201).json(category)
  } catch (error) {
    console.error('Erro ao criar categoria:', error)
    return res.status(500).json({ error: 'Erro ao criar categoria' })
  }
}

// TREINOS (ADMIN)
export async function createWorkoutAdmin(req, res) {
  try {
    const userId = req.user.userId
    const user = await prisma.user.findUnique({ where: { id: userId } })
    
    if (user?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Apenas admin' })
    }

    const { title, description, categoryId, videoUrl, week, module, coverImage, status } = req.body

    const workout = await prisma.workout.create({
      data: {
        title,
        description,
        categoryId,
        videoUrl,
        week,
        module,
        coverImage,
        status
      }
    })

    return res.status(201).json(workout)
  } catch (error) {
    console.error('Erro ao criar treino:', error)
    return res.status(500).json({ error: 'Erro ao criar treino' })
  }
}

export async function updateWorkoutAdmin(req, res) {
  try {
    const userId = req.user.userId
    const user = await prisma.user.findUnique({ where: { id: userId } })
    
    if (user?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Apenas admin' })
    }

    const { workoutId } = req.params
    const { title, description, categoryId, videoUrl, week, module, coverImage, status } = req.body

    const workout = await prisma.workout.update({
      where: { id: workoutId },
      data: {
        title,
        description,
        categoryId,
        videoUrl,
        week,
        module,
        coverImage,
        status
      }
    })

    return res.json(workout)
  } catch (error) {
    console.error('Erro ao atualizar treino:', error)
    return res.status(500).json({ error: 'Erro ao atualizar treino' })
  }
}

export async function deleteWorkoutAdmin(req, res) {
  try {
    const userId = req.user.userId
    const user = await prisma.user.findUnique({ where: { id: userId } })
    
    if (user?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Apenas admin' })
    }

    const { workoutId } = req.params
    await prisma.workout.delete({ where: { id: workoutId } })

    return res.json({ message: 'Treino deletado' })
  } catch (error) {
    console.error('Erro ao deletar treino:', error)
    return res.status(500).json({ error: 'Erro ao deletar treino' })
  }
}

// PERGUNTAS
export async function getPendingQuestions(req, res) {
  try {
    const questions = await prisma.question.findMany({
      where: { status: 'PENDING' },
      include: { user: true }
    })
    return res.json(questions)
  } catch (error) {
    console.error('Erro ao buscar perguntas:', error)
    return res.status(500).json({ error: 'Erro ao buscar perguntas' })
  }
}

export async function answerQuestion(req, res) {
  try {
    const userId = req.user.userId
    const user = await prisma.user.findUnique({ where: { id: userId } })
    
    if (user?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Apenas admin' })
    }

    const { questionId } = req.params
    const { text } = req.body

    const answer = await prisma.answer.create({
      data: { questionId, text }
    })

    await prisma.question.update({
      where: { id: questionId },
      data: { status: 'ANSWERED' }
    })

    return res.status(201).json(answer)
  } catch (error) {
    console.error('Erro ao responder pergunta:', error)
    return res.status(500).json({ error: 'Erro ao responder pergunta' })
  }
}

// CONFIGURAÇÕES
export async function getSettings(req, res) {
  try {
    let settings = await prisma.adminSettings.findFirst()
    if (!settings) {
      settings = await prisma.adminSettings.create({
        data: {}
      })
    }
    return res.json(settings)
  } catch (error) {
    console.error('Erro ao buscar configurações:', error)
    return res.status(500).json({ error: 'Erro ao buscar configurações' })
  }
}

export async function updateSettings(req, res) {
  try {
    const userId = req.user.userId
    const user = await prisma.user.findUnique({ where: { id: userId } })
    
    if (user?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Apenas admin' })
    }

    const { phone, whatsappUrl, motivationalPhrase, profileImage, logo } = req.body

    let settings = await prisma.adminSettings.findFirst()
    if (!settings) {
      settings = await prisma.adminSettings.create({
        data: { phone, whatsappUrl, motivationalPhrase, profileImage, logo }
      })
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