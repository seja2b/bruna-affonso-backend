import jwt from 'jsonwebtoken'

function getRequiredSecret(name, legacyName = null) {
  const secret = process.env[name] || (legacyName ? process.env[legacyName] : null)

  if (!secret || secret.trim().length < 32) {
    const acceptedNames = legacyName ? `${name} (ou temporariamente ${legacyName})` : name
    throw new Error(`${acceptedNames} deve estar configurado com pelo menos 32 caracteres`)
  }

  return secret
}

function getRefreshSecret() {
  return getRequiredSecret('REFRESH_SECRET', 'JWT_REFRESH_SECRET')
}

const ACCESS_TOKEN_TTL = process.env.JWT_ACCESS_TTL || '30m'
const REFRESH_TOKEN_TTL = process.env.JWT_REFRESH_TTL || '30d'
const JWT_OPTIONS = { algorithm: 'HS256' }

export function generateToken(userId, role) {
  return jwt.sign(
    { userId, role },
    getRequiredSecret('JWT_SECRET'),
    { ...JWT_OPTIONS, expiresIn: ACCESS_TOKEN_TTL }
  )
}

export function generateRefreshToken(userId) {
  return jwt.sign(
    { userId },
    getRefreshSecret(),
    { ...JWT_OPTIONS, expiresIn: REFRESH_TOKEN_TTL }
  )
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, getRequiredSecret('JWT_SECRET'), { algorithms: ['HS256'] })
  } catch (error) {
    return null
  }
}

export function verifyRefreshToken(token) {
  try {
    return jwt.verify(token, getRefreshSecret(), { algorithms: ['HS256'] })
  } catch (error) {
    return null
  }
}
