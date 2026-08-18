const buckets = new Map()

function getClientKey(req, scope) {
  const forwarded = req.headers['x-forwarded-for']
  const ip = typeof forwarded === 'string'
    ? forwarded.split(',')[0].trim()
    : req.ip || req.socket?.remoteAddress || 'unknown'
  return `${scope}:${ip}`
}

export function createRateLimiter({ windowMs = 15 * 60 * 1000, max = 20, scope = 'default' } = {}) {
  return (req, res, next) => {
    const now = Date.now()
    const key = getClientKey(req, scope)
    const current = buckets.get(key)

    if (!current || current.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs })
      return next()
    }

    current.count += 1

    if (current.count > max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000))
      res.set('Retry-After', String(retryAfterSeconds))
      return res.status(429).json({
        error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.'
      })
    }

    next()
  }
}

// Limpeza periódica para impedir crescimento indefinido do mapa em processos longos.
setInterval(() => {
  const now = Date.now()
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= now) buckets.delete(key)
  }
}, 10 * 60 * 1000).unref?.()
