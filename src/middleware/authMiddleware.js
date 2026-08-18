import { verifyToken } from '../utils/jwt.js'

export default function authMiddleware(req, res, next) {
  const authorization = req.headers.authorization

  if (!authorization?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token não fornecido' })
  }

  const token = authorization.slice(7).trim()
  const decoded = verifyToken(token)

  if (!decoded) {
    return res.status(401).json({ error: 'Token inválido ou expirado' })
  }

  req.user = decoded
  next()
}
