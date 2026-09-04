import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

function addMonths(date, months) {
  const source = new Date(date)
  const day = source.getUTCDate()
  const result = new Date(source)
  result.setUTCDate(1)
  result.setUTCMonth(result.getUTCMonth() + months)
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate()
  result.setUTCDate(Math.min(day, lastDay))
  return result
}

async function ensureQuarterlyReassessmentReminders(adminUserId) {
  const students = await prisma.student.findMany({
    where: { user: { status: 'APPROVED' } },
    select: {
      id: true,
      user: { select: { id: true, name: true } },
      assessmentCycles: {
        orderBy: { sequence: 'desc' },
        take: 1,
        select: { id: true, completedAt: true }
      }
    }
  })
  const now = new Date()
  const due = students.filter((student) => {
    const latest = student.assessmentCycles[0]
    return latest?.completedAt && addMonths(latest.completedAt, 3) <= now
  })
  if (!due.length) return

  await prisma.notification.createMany({
    data: due.map((student) => {
      const latest = student.assessmentCycles[0]
      return {
        userId: adminUserId,
        title: 'Reavaliação trimestral',
        message: `Já se passaram 3 meses desde a última avaliação de ${student.user.name}. Libere uma nova reavaliação para acompanhar a evolução.`,
        type: 'REASSESSMENT_DUE',
        key: `reassessment-due:${adminUserId}:${latest.id}`,
        actionUrl: `/admin/alunos/${student.user.id}`
      }
    }),
    skipDuplicates: true
  })
}

export async function getMyNotifications(req, res) {
  try {
    if (req.user.role === 'ADMIN') await ensureQuarterlyReassessmentReminders(req.user.userId)
    const notifications = await prisma.notification.findMany({
      where: { userId: req.user.userId },
      orderBy: { createdAt: 'desc' },
      take: 100
    })

    const unreadCount = notifications.filter((item) => !item.isRead).length
    return res.json({ notifications, unreadCount })
  } catch (error) {
    console.error('Erro ao buscar notificações:', error)
    return res.status(500).json({ error: 'Erro ao buscar notificações' })
  }
}

export async function markNotificationRead(req, res) {
  try {
    const { notificationId } = req.params
    const result = await prisma.notification.updateMany({
      where: { id: notificationId, userId: req.user.userId },
      data: { isRead: true }
    })

    if (result.count === 0) return res.status(404).json({ error: 'Notificação não encontrada' })
    return res.json({ message: 'Notificação marcada como lida' })
  } catch (error) {
    console.error('Erro ao marcar notificação:', error)
    return res.status(500).json({ error: 'Erro ao atualizar notificação' })
  }
}

export async function markAllNotificationsRead(req, res) {
  try {
    const result = await prisma.notification.updateMany({
      where: { userId: req.user.userId, isRead: false },
      data: { isRead: true }
    })

    return res.json({ message: 'Notificações marcadas como lidas', updated: result.count })
  } catch (error) {
    console.error('Erro ao marcar notificações:', error)
    return res.status(500).json({ error: 'Erro ao atualizar notificações' })
  }
}
