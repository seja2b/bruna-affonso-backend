const buckets = new Map()

function getClientKey(req, scope) {
  // req.ip respeita a configuração de trust proxy do Express.
  // Evitamos confiar diretamente em x-forwarded-for enviado pelo cliente.
  const ip = req.ip || req.socket?.remoteAddress || 'unknown'
  return `${scope}:${ip}`
}

export function createRateLimiter({ windowMs = 15 * 60 * 1000, max = 20, scope = 'default' } = {}) {
  return (req, res, next) => {
    const now = Date.now()
    const key = getClientKey(req, scope)
    const current = buckets.get(key)

    res.set('X-RateLimit-Limit', String(max))

    if (!current || current.resetAt <= now) {
      const resetAt = now + windowMs
      buckets.set(key, { count: 1, resetAt })
      res.set('X-RateLimit-Remaining', String(Math.max(0, max - 1)))
      res.set('X-RateLimit-Reset', String(Math.ceil(resetAt / 1000)))
      return next()
    }

    current.count += 1
    res.set('X-RateLimit-Remaining', String(Math.max(0, max - current.count)))
    res.set('X-RateLimit-Reset', String(Math.ceil(current.resetAt / 1000)))

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
