export default function securityHeadersMiddleware(req, res, next) {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
    'X-DNS-Prefetch-Control': 'off'
  })

  if (process.env.NODE_ENV === 'production') {
    res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  }

  if (req.path.startsWith('/api/auth')) {
    res.set('Cache-Control', 'no-store')
  }

  next()
}
