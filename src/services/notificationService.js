export async function createNotification(db, { userId, title, message, type }) {
  if (!userId || !title || !message || !type) return null

  return db.notification.create({
    data: { userId, title, message, type }
  })
}

export async function createNotifications(db, notifications = []) {
  const valid = notifications.filter((item) => item?.userId && item?.title && item?.message && item?.type)
  if (valid.length === 0) return { count: 0 }

  return db.notification.createMany({ data: valid })
}
