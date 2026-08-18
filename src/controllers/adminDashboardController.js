import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export async function getAdminDashboard(req, res) {
  try {
    const [
      totalStudents,
      pendingStudents,
      totalWorkouts,
      pendingQuestions,
      totalVideos,
      completedWeeks,
      recentStudents,
      recentCompletions
    ] = await Promise.all([
      prisma.user.count({ where: { role: 'STUDENT', status: 'APPROVED' } }),
      prisma.user.count({ where: { role: 'STUDENT', status: 'PENDING' } }),
      prisma.workout.count(),
      prisma.question.count({ where: { status: 'PENDING' } }),
      prisma.video.count(),
      prisma.weeklyTracking.count({ where: { isCompleted: true } }),
      prisma.user.findMany({
        where: { role: 'STUDENT' },
        select: { id: true, name: true, email: true, profilePhoto: true, status: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 5
      }),
      prisma.weeklyTracking.findMany({
        where: { isCompleted: true, completedAt: { not: null } },
        select: {
          id: true,
          weekNumber: true,
          completedAt: true,
          student: {
            select: {
              id: true,
              user: { select: { id: true, name: true, profilePhoto: true } }
            }
          }
        },
        orderBy: { completedAt: 'desc' },
        take: 6
      })
    ])

    return res.json({
      totalStudents,
      pendingStudents,
      totalWorkouts,
      pendingQuestions,
      totalVideos,
      completedWeeks,
      recentStudents,
      recentCompletions: recentCompletions.map((item) => ({
        id: item.id,
        weekNumber: item.weekNumber,
        completedAt: item.completedAt,
        studentId: item.student.id,
        userId: item.student.user.id,
        studentName: item.student.user.name,
        profilePhoto: item.student.user.profilePhoto
      }))
    })
  } catch (error) {
    console.error('Erro ao buscar dashboard administrativo:', error)
    return res.status(500).json({ error: 'Erro ao buscar dashboard' })
  }
}
