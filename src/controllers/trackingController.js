import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export async function getStudentWeeks(req, res) {
  try {
    const userId = req.user.id // ID do USER, não do Student
    
    // PASSO 1: Buscar o Student usando o userId
    const student = await prisma.student.findUnique({
      where: { userId },
      select: { id: true }
    })

    if (!student) {
      return res.status(404).json({ error: 'Aluno não encontrado' })
    }

    const studentId = student.id

    // PASSO 2: Buscar as semanas do aluno
    let weeks = await prisma.weeklyTracking.findMany({
      where: { studentId },
      include: {
        exercises: true,
        observation: true
      },
      orderBy: { weekNumber: 'asc' }
    })

    // PASSO 3: Se não tiver semanas, criar as 52 semanas
    if (weeks.length === 0) {
      const startDate = new Date()
      
      for (let i = 1; i <= 52; i++) {
        const weekStart = new Date(startDate)
        weekStart.setDate(weekStart.getDate() + (i - 1) * 7)
        
        const weekEnd = new Date(weekStart)
        weekEnd.setDate(weekEnd.getDate() + 6)

        const currentWeek = Math.ceil(
          (new Date() - startDate) / (1000 * 60 * 60 * 24 * 7)
        )

        await prisma.weeklyTracking.create({
          data: {
            studentId,
            weekNumber: i,
            startDate: weekStart,
            endDate: weekEnd,
            isReleased: i <= currentWeek + 1,
            isCompleted: false
          }
        })
      }

      // Buscar novamente as semanas criadas
      weeks = await prisma.weeklyTracking.findMany({
        where: { studentId },
        include: {
          exercises: true,
          observation: true
        },
        orderBy: { weekNumber: 'asc' }
      })
    }

    res.json(weeks)
  } catch (error) {
    console.error('Error getStudentWeeks:', error)
    res.status(500).json({ error: 'Erro ao buscar semanas' })
  }
}

export async function getWeekDetails(req, res) {
  try {
    const { weekId } = req.params
    const userId = req.user.id

    // Verificar se o aluno tem acesso a essa semana
    const student = await prisma.student.findUnique({
      where: { userId },
      select: { id: true }
    })

    if (!student) {
      return res.status(404).json({ error: 'Aluno não encontrado' })
    }

    const week = await prisma.weeklyTracking.findFirst({
      where: {
        id: weekId,
        studentId: student.id
      },
      include: {
        exercises: true,
        observation: true
      }
    })

    if (!week) {
      return res.status(404).json({ error: 'Semana não encontrada' })
    }

    res.json(week)
  } catch (error) {
    console.error('Error getWeekDetails:', error)
    res.status(500).json({ error: 'Erro ao buscar semana' })
  }
}

export async function saveExercises(req, res) {
  try {
    const { weekId, exercises } = req.body
    const userId = req.user.id

    // Verificar se o aluno tem acesso
    const student = await prisma.student.findUnique({
      where: { userId },
      select: { id: true }
    })

    if (!student) {
      return res.status(404).json({ error: 'Aluno não encontrado' })
    }

    // Atualizar exercícios
    await prisma.trackingExercise.deleteMany({
      where: { weeklyTrackingId: weekId }
    })

    for (let exercise of exercises) {
      await prisma.trackingExercise.create({
        data: {
          weeklyTrackingId: weekId,
          exerciseName: exercise.exerciseName,
          trainingType: exercise.trainingType,
          weight: exercise.weight || null,
          reps: exercise.reps || null,
          notes: exercise.notes || null
        }
      })
    }

    res.json({ message: 'Exercícios salvos com sucesso' })
  } catch (error) {
    console.error('Error saveExercises:', error)
    res.status(500).json({ error: 'Erro ao salvar exercícios' })
  }
}

export async function saveStudentNote(req, res) {
  try {
    const { weekId, studentNote } = req.body
    const userId = req.user.id

    // Verificar se o aluno tem acesso
    const student = await prisma.student.findUnique({
      where: { userId },
      select: { id: true }
    })

    if (!student) {
      return res.status(404).json({ error: 'Aluno não encontrado' })
    }

    // Atualizar ou criar observação
    let observation = await prisma.weeklyObservation.findUnique({
      where: { weeklyTrackingId: weekId }
    })

    if (observation) {
      observation = await prisma.weeklyObservation.update({
        where: { weeklyTrackingId: weekId },
        data: { studentNote }
      })
    } else {
      observation = await prisma.weeklyObservation.create({
        data: {
          weeklyTrackingId: weekId,
          studentNote
        }
      })
    }

    res.json({ message: 'Observação salva com sucesso', observation })
  } catch (error) {
    console.error('Error saveStudentNote:', error)
    res.status(500).json({ error: 'Erro ao salvar observação' })
  }
}

export async function saveProfilePhoto(req, res) {
  try {
    const { studentId } = req.params
    const { profilePhoto } = req.body
    const userId = req.user.id

    // Verificar se o aluno está atualizando sua própria foto
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: { userId: true }
    })

    if (!student || student.userId !== userId) {
      return res.status(403).json({ error: 'Acesso negado' })
    }

    // Atualizar foto do usuário
    const user = await prisma.user.update({
      where: { id: userId },
      data: { profilePhoto }
    })

    res.json({ message: 'Foto salva com sucesso', user })
  } catch (error) {
    console.error('Error saveProfilePhoto:', error)
    res.status(500).json({ error: 'Erro ao salvar foto' })
  }
}

export async function getRanking(req, res) {
  try {
    const ranking = await prisma.studentRanking.findMany({
      include: {
        student: {
          include: {
            user: {
              select: {
                name: true,
                email: true,
                profilePhoto: true
              }
            }
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