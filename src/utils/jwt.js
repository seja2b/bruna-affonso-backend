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

export function generateToken(userId, role) {
  return jwt.sign({ userId, role }, getRequiredSecret('JWT_SECRET'), { expiresIn: '7d' })
}

export function generateRefreshToken(userId) {
  return jwt.sign({ userId }, getRefreshSecret(), { expiresIn: '30d' })
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, getRequiredSecret('JWT_SECRET'))
  } catch (error) {
    return null
  }
}

export function verifyRefreshToken(token) {
  try {
    return jwt.verify(token, getRefreshSecret())
  } catch (error) {
    return null
  }
}
