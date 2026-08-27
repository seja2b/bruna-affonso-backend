const SENSITIVE_KEYS = new Set([
  'password',
  'passwordHash',
  'refreshToken',
  'refreshTokenHash',
  'jwtSecret',
  'refreshSecret'
])

function sanitize(value) {
  if (Array.isArray(value)) return value.map(sanitize)
  if (!value || typeof value !== 'object') return value

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !SENSITIVE_KEYS.has(key))
      .map(([key, nestedValue]) => [key, sanitize(nestedValue)])
  )
}

export default function sanitizeAdminResponseMiddleware(req, res, next) {
  const originalJson = res.json.bind(res)

  res.json = (payload) => originalJson(sanitize(payload))
  next()
}
