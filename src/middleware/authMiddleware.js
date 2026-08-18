import jwt from 'jsonwebtoken'

export default function authMiddleware(req, res, next) {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '')

    if (!token) {
      return res.status(401).json({ error: 'Token não fornecido' })
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret_key')
    req.user = decoded
    next()
  } catch (error) {
    console.error('Erro ao verificar token:', error.message)
    return res.status(401).json({ error: 'Token inválido' })
  }
}