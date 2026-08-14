import jwt from 'jsonwebtoken'

export const authMiddleware = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1]

    if (!token) {
      return res.status(401).json({ error: 'Token não fornecido' })
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    req.user = decoded
    next()
  } catch (error) {
    console.error('Erro ao verificar token:', error)
    return res.status(401).json({ error: 'Token inválido' })
  }
}

export const adminOnly = (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Não autenticado' })
    }

    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Acesso apenas para administradores' })
    }

    next()
  } catch (error) {
    console.error('Erro ao verificar admin:', error)
    return res.status(403).json({ error: 'Acesso negado' })
  }
}

export const studentOnly = (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Não autenticado' })
    }

    if (req.user.role !== 'STUDENT') {
      return res.status(403).json({ error: 'Acesso apenas para alunos' })
    }

    next()
  } catch (error) {
    console.error('Erro ao verificar student:', error)
    return res.status(403).json({ error: 'Acesso negado' })
  }
}