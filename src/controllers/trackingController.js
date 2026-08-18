import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export async function getStudentWeeks(req, res) {
  try {
    const userId = req.user.userId
    
    const student = await prisma.student.findUnique({
      where: { userId },
      select: { id: true }
    })

    if (!student) {
      return res.status(404).json({ error: 'Aluno não encontrado' })
    }

    const studentId = student.id

    let weeks = await prisma.weeklyTracking.findMany({
      where: { studentId },
      include: {
        exercises: true,
        observation: true
      },
      orderBy: { weekNumber: 'asc' }
    })

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

export async function saveTrackingExercise(req, res) {
  try {
    const { weekId, exercises } = req.body
    const userId = req.user.userId

    const student = await prisma.student.findUnique({
      where: { userId },
      select: { id: true }
    })

    if (!student) {
      return res.status(404).json({ error: 'Aluno não encontrado' })
    }

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
    console.error('Error saveTrackingExercise:', error)
    res.status(500).json({ error: 'Erro ao salvar exercícios' })
  }
}

export async function saveStudentNote(req, res) {
  try {
    const { weekId, studentNote } = req.body
    const userId = req.user.userId

    const student = await prisma.student.findUnique({
      where: { userId },
      select: { id: true }
    })

    if (!student) {
      return res.status(404).json({ error: 'Aluno não encontrado' })
    }

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

export async function saveTeacherNote(req, res) {
  try {
    const { weekId, teacherNote } = req.body

    let observation = await prisma.weeklyObservation.findUnique({
      where: { weeklyTrackingId: weekId }
    })

    if (observation) {
      observation = await prisma.weeklyObservation.update({
        where: { weeklyTrackingId: weekId },
        data: { teacherNote }
      })
    } else {
      observation = await prisma.weeklyObservation.create({
        data: {
          weeklyTrackingId: weekId,
          teacherNote
        }
      })
    }

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

export async function getStudentsTracking(req, res) {
  try {
    const students = await prisma.student.findMany({
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            status: true,
            profilePhoto: true
          }
        },
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

    const filteredStudents = students.filter(s => s.user.status === 'APPROVED')

    const formattedStudents = filteredStudents.map(student => ({
      id: student.id,
      name: student.user.name,
      email: student.user.email,
      profilePhoto: student.user.profilePhoto,
      weeklyTrackings: student.weeklyTrackings,
      ranking: student.ranking
    }))

    res.json(formattedStudents)
  } catch (error) {
    console.error('Error getStudentsTracking:', error)
    res.status(500).json({ error: 'Erro ao buscar alunos' })
  }
}

export async function updateProfilePhoto(req, res) {
  try {
    const { studentId } = req.params
    const { profilePhoto } = req.body
    const userId = req.user.userId

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: { userId: true }
    })

    if (!student || student.userId !== userId) {
      return res.status(403).json({ error: 'Acesso negado' })
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: { profilePhoto }
    })

    res.json({ message: 'Foto salva com sucesso', user })
  } catch (error) {
    console.error('Error updateProfilePhoto:', error)
    res.status(500).json({ error: 'Erro ao salvar foto' })
  }
}