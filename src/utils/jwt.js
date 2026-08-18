import jwt from 'jsonwebtoken'

function getRequiredSecret(name) {
  const secret = process.env[name]

  if (!secret || secret.trim().length < 32) {
    throw new Error(`${name} deve estar configurado com pelo menos 32 caracteres`)
  }

  return secret
}

export function generateToken(userId, role) {
  return jwt.sign({ userId, role }, getRequiredSecret('JWT_SECRET'), { expiresIn: '7d' })
}

export function generateRefreshToken(userId) {
  return jwt.sign({ userId }, getRequiredSecret('REFRESH_SECRET'), { expiresIn: '30d' })
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
    return jwt.verify(token, getRequiredSecret('REFRESH_SECRET'))
  } catch (error) {
    return null
  }
}
