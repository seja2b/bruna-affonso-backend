import crypto from 'node:crypto'

const DEFAULT_TTL_DAYS = 30
const ROTATION_GRACE_MS = 5_000
const COOKIE_NAME = process.env.REFRESH_COOKIE_NAME || 'bruna_refresh'

function getTtlMs() {
  const configured = Number.parseInt(process.env.REFRESH_SESSION_TTL_DAYS || `${DEFAULT_TTL_DAYS}`, 10)
  const days = Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_TTL_DAYS
  return days * 24 * 60 * 60 * 1000
}

function buildSessionData(userId, req, tokenHash, legacyTokenHash = null) {
  return {
    userId,
    tokenHash,
    legacyTokenHash,
    expiresAt: new Date(Date.now() + getTtlMs()),
    userAgent: String(req.get('user-agent') || '').slice(0, 500) || null,
    ipAddress: String(req.ip || '').slice(0, 100) || null
  }
}

function parseCookies(cookieHeader = '') {
  return cookieHeader.split(';').reduce((cookies, chunk) => {
    const separator = chunk.indexOf('=')
    if (separator === -1) return cookies
    const key = chunk.slice(0, separator).trim()
    const value = chunk.slice(separator + 1).trim()
    if (key) cookies[key] = decodeURIComponent(value)
    return cookies
  }, {})
}

function wasRevokedRecently(revokedAt) {
  return Boolean(revokedAt && Date.now() - revokedAt.getTime() <= ROTATION_GRACE_MS)
}

export function hashRefreshToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

export function createOpaqueRefreshToken() {
  return crypto.randomBytes(48).toString('base64url')
}

export function getRefreshTokenFromRequest(req) {
  const cookies = parseCookies(req.headers.cookie || '')
  return cookies[COOKIE_NAME] || ''
}

export function setRefreshCookie(res, token) {
  const isProduction = process.env.NODE_ENV === 'production'
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    path: '/api/auth',
    maxAge: getTtlMs()
  })
}

export function clearRefreshCookie(res) {
  const isProduction = process.env.NODE_ENV === 'production'
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    path: '/api/auth'
  })
}

export function isUserAllowedToAuthenticate(user) {
  if (!user) return false
  if (user.status === 'INACTIVE' || user.status === 'REJECTED') return false
  if (user.role === 'STUDENT' && user.status === 'PENDING') return false
  return true
}

export async function pruneExpiredRefreshSessions(db) {
  await db.refreshSession.deleteMany({
    where: { expiresAt: { lt: new Date() } }
  })
}

export async function issueRefreshSession(db, userId, req, { legacyTokenHash = null } = {}) {
  await pruneExpiredRefreshSessions(db)
  const rawToken = createOpaqueRefreshToken()
  await db.refreshSession.create({
    data: buildSessionData(userId, req, hashRefreshToken(rawToken), legacyTokenHash)
  })
  return rawToken
}

export async function rotateRefreshSession(prisma, rawToken, req) {
  const tokenHash = hashRefreshToken(rawToken)
  const existing = await prisma.refreshSession.findUnique({
    where: { tokenHash },
    include: {
      user: { select: { id: true, role: true, status: true } }
    }
  })

  if (!existing) return { ok: false, reason: 'invalid' }

  if (existing.revokedAt) {
    if (wasRevokedRecently(existing.revokedAt)) {
      return { ok: false, reason: 'recent_rotation' }
    }

    await prisma.refreshSession.updateMany({
      where: { userId: existing.userId, revokedAt: null },
      data: { revokedAt: new Date() }
    })
    return { ok: false, reason: 'replayed' }
  }

  if (existing.expiresAt <= new Date()) {
    await prisma.refreshSession.update({
      where: { id: existing.id },
      data: { revokedAt: new Date() }
    })
    return { ok: false, reason: 'expired' }
  }

  if (!isUserAllowedToAuthenticate(existing.user)) {
    await prisma.refreshSession.updateMany({
      where: { userId: existing.userId, revokedAt: null },
      data: { revokedAt: new Date() }
    })
    return { ok: false, reason: 'blocked' }
  }

  const newRawToken = createOpaqueRefreshToken()
  const newTokenHash = hashRefreshToken(newRawToken)
  const now = new Date()

  const rotated = await prisma.$transaction(async (tx) => {
    const revoked = await tx.refreshSession.updateMany({
      where: { id: existing.id, revokedAt: null },
      data: { revokedAt: now }
    })

    if (revoked.count !== 1) return false

    await tx.refreshSession.create({
      data: buildSessionData(existing.userId, req, newTokenHash)
    })

    return true
  })

  if (!rotated) {
    const current = await prisma.refreshSession.findUnique({
      where: { id: existing.id },
      select: { revokedAt: true, userId: true }
    })

    if (wasRevokedRecently(current?.revokedAt)) {
      return { ok: false, reason: 'recent_rotation' }
    }

    await prisma.refreshSession.updateMany({
      where: { userId: existing.userId, revokedAt: null },
      data: { revokedAt: new Date() }
    })
    return { ok: false, reason: 'replayed' }
  }

  return { ok: true, user: existing.user, rawToken: newRawToken }
}

export async function migrateLegacyRefreshSession(prisma, legacyToken, userId, req) {
  const legacyTokenHash = hashRefreshToken(legacyToken)
  const alreadyMigrated = await prisma.refreshSession.findUnique({ where: { legacyTokenHash } })
  if (alreadyMigrated) return { ok: false, reason: 'already_migrated' }

  try {
    const rawToken = await issueRefreshSession(prisma, userId, req, { legacyTokenHash })
    return { ok: true, rawToken }
  } catch (error) {
    if (error?.code === 'P2002') return { ok: false, reason: 'already_migrated' }
    throw error
  }
}

export async function revokeRefreshSession(prisma, rawToken) {
  if (!rawToken) return
  await prisma.refreshSession.updateMany({
    where: { tokenHash: hashRefreshToken(rawToken), revokedAt: null },
    data: { revokedAt: new Date() }
  })
}
