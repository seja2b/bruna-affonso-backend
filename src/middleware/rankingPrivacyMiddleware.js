export default function rankingPrivacyMiddleware(req, res, next) {
  const originalJson = res.json.bind(res)

  res.json = (payload) => {
    if (!Array.isArray(payload)) return originalJson(payload)

    const minimized = payload.map((entry) => {
      if (!entry?.student?.user) return entry
      const { email, ...publicUser } = entry.student.user
      return {
        ...entry,
        student: {
          ...entry.student,
          user: publicUser
        }
      }
    })

    return originalJson(minimized)
  }

  next()
}
