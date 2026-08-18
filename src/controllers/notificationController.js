import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export async function getMyNotifications(req, res) {
  try {
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
