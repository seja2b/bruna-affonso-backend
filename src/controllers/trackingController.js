import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// GET todas as semanas do aluno
export const getStudentWeeks = async (req, res) => {
  try {
    const { studentId } = req.params

    // Se receber userId em vez de studentId, busca o studentId
    let actualStudentId = studentId
    
    if (studentId && studentId.length > 20) {
      // Parece ser um userId, busca o studentId
      const student = await prisma.student.findUnique({
        where: { userId: studentId }
      })
      if (!student) {
        return res.status(404).json({ error: 'Aluno não encontrado' })
      }
      actualStudentId = student.id
    }

    // Pega todas as semanas do aluno
    let weeks = await prisma.weeklyTracking.findMany({
      where: { studentId: actualStudentId },
      include: {
        exercises: true,
        observation: true
      },
      orderBy: { weekNumber: 'asc' }
    })

    // Se não houver semanas, cria a primeira
    if (weeks.length === 0) {
      const startDate = new Date()
      startDate.setDate(startDate.getDate() - startDate.getDay() + 1)
      const endDate = new Date(startDate)
      endDate.setDate(endDate.getDate() + 6)

      const week1 = await prisma.weeklyTracking.create({
        data: {
          studentId: actualStudentId,
          weekNumber: 1,
          startDate,
          endDate,
          isReleased: true
        },
        include: { exercises: true, observation: true }
      })
      weeks = [week1]
    }

    // Valida liberação automática
    for (let i = 1; i < weeks.length; i++) {
      const previousWeek = weeks[i - 1]
      const currentWeek = weeks[i]

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
          include: {
            user: {
              select: {
                id: true,
                name: true,
                profilePhoto: true,
                email: true
              }
            }
          }
        }
      },
      orderBy: [
        { totalPoints: 'desc' },
        { weeksCompleted: 'desc' }
      ]
    })

    // Formata resposta
    const rankingFormatted = ranking.map((item, index) => ({
      position: index + 1,
      id: item.id,
      studentId: item.studentId,
      totalPoints: item.totalPoints,
      weeksCompleted: item.weeksCompleted,
      student: {
        id: item.student.user.id,
        name: item.student.user.name,
        email: item.student.user.email,
        profilePhoto: item.student.user.profilePhoto
      }
    }))

    return res.json(rankingFormatted)
  } catch (error) {
    console.error('Error getRanking:', error)
    return res.status(500).json({ error: error.message })
  }
}

// GET alunos para admin (com tracking)
export const getStudentsTracking = async (req, res) => {
  try {
    const students = await prisma.student.findMany({
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
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

    // Filtra apenas alunos aprovados
    const filteredStudents = students.filter(s => s.user.status === 'APPROVED')

    // Formata resposta
    const formattedStudents = filteredStudents.map(student => ({
      id: student.id,
      name: student.user.name,
      email: student.user.email,
      profilePhoto: student.user.profilePhoto,
      weeklyTrackings: student.weeklyTrackings,
      ranking: student.ranking
    }))

    return res.json(formattedStudents)
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

    // Busca o student
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: { userId: true }
    })

    if (!student) {
      return res.status(404).json({ error: 'Aluno não encontrado' })
    }

    // Atualiza foto no User
    const user = await prisma.user.update({
      where: { id: student.userId },
      data: { profilePhoto }
    })

    return res.json(user)
  } catch (error) {
    console.error('Error updateProfilePhoto:', error)
    return res.status(500).json({ error: error.message })
  }
}

// ===== FUNÇÃO AUXILIAR =====
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
      let ranking = await prisma.studentRanking.findUnique({
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