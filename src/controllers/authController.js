import { PrismaClient } from '@prisma/client'
import { hashPassword, comparePassword } from '../utils/password.js'
import { generateToken, generateRefreshToken } from '../utils/jwt.js'

const prisma = new PrismaClient()

export const register = async (req, res) => {
  try {
    const { email, password, name } = req.body

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, senha e nome são obrigatórios' })
    }

    const existingUser = await prisma.user.findUnique({ where: { email } })
    if (existingUser) {
      return res.status(400).json({ error: 'Email já registrado' })
    }

    const existingAdmin = await prisma.user.findFirst({
      where: { role: 'ADMIN' }
    })

    const role = !existingAdmin ? 'ADMIN' : 'STUDENT'
    const status = role === 'ADMIN' ? 'APPROVED' : 'PENDING'

    const hashedPassword = await hashPassword(password)

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        role,
        status
      }
    })

    if (role === 'STUDENT') {
      await prisma.student.create({
        data: { userId: user.id }
      })
    } else {
      await prisma.admin.create({
        data: { userId: user.id }
      })
    }

    const token = generateToken(user.id, user.role)
    const refreshToken = generateRefreshToken(user.id)

    return res.status(201).json({
      message: role === 'ADMIN' ? 'Admin criado com sucesso!' : 'Usuário criado e aguardando aprovação',
      token,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        status: user.status
      }
    })
  } catch (error) {
    console.error('Erro ao registrar:', error)
    return res.status(500).json({ error: 'Erro ao registrar usuário' })
  }
}

export const login = async (req, res) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({ error: 'Email e senha são obrigatórios' })
    }

    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) {
      return res.status(401).json({ error: 'Email ou senha inválidos' })
    }

    const passwordValid = await comparePassword(password, user.password)
    if (!passwordValid) {
      return res.status(401).json({ error: 'Email ou senha inválidos' })
    }

    const token = generateToken(user.id, user.role)
    const refreshToken = generateRefreshToken(user.id)

    return res.json({
      token,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        status: user.status
      }
    })
  } catch (error) {
    console.error('Erro ao fazer login:', error)
    return res.status(500).json({ error: 'Erro ao fazer login' })
  }
}

export const logout = async (req, res) => {
  try {
    // No JWT, o logout é feito no frontend deletando o token
    // Apenas confirmamos que o logout foi solicitado
    return res.json({ message: 'Logout realizado com sucesso' })
  } catch (error) {
    console.error('Erro ao fazer logout:', error)
    return res.status(500).json({ error: 'Erro ao fazer logout' })
  }
}

export const getMe = async (req, res) => {
  try {
    const userId = req.user.userId

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        phone: true,
        profilePhoto: true
      }
    })

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' })
    }

    // Se for STUDENT, busca o studentId
    let studentId = null
    if (user.role === 'STUDENT') {
      const student = await prisma.student.findUnique({
        where: { userId: user.id }
      })
      studentId = student?.id || null
    }

    return res.json({
      ...user,
      studentId
    })
  } catch (error) {
    console.error('Erro ao buscar usuário:', error)
    return res.status(500).json({ error: 'Erro ao buscar usuário' })
  }
}

export const debugUser = async (req, res) => {
  try {
    const { email } = req.query
    
    const user = await prisma.user.findUnique({
      where: { email },
      include: { student: true, admin: true }
    })
    
    return res.json({
      user,
      message: 'Debug info'
    })
  } catch (error) {
    console.error('Erro:', error)
    return res.status(500).json({ error: error.message })
  }
}