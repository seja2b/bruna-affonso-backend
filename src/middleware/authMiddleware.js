import { PrismaClient } from '@prisma/client'
import { verifyToken } from '../utils/jwt.js'

const prisma = new PrismaClient()

export default async function authMiddleware(req, res, next) {
  try {
    const authorization = req.headers.authorization

    if (!authorization?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token não fornecido' })
    }

    const token = authorization.slice(7).trim()
    const decoded = verifyToken(token)

    if (!decoded?.userId) {
      return res.status(401).json({ error: 'Token inválido ou expirado' })
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, role: true, status: true }
    })

    if (!user) {
      return res.status(401).json({ error: 'Sessão não autorizada' })
    }

    if (user.status === 'INACTIVE' || user.status === 'REJECTED') {
      return res.status(403).json({ error: 'Conta sem acesso' })
    }

    if (user.role === 'STUDENT' && user.status !== 'APPROVED') {
      return res.status(403).json({ error: 'Cadastro aguardando aprovação' })
    }

    req.user = {
      ...decoded,
      userId: user.id,
      role: user.role,
      status: user.status
    }

    return next()
  } catch (error) {
    console.error('Erro ao validar sessão:', error)
    return res.status(500).json({ error: 'Erro ao validar sessão' })
  }
}
