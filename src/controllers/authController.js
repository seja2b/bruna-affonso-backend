import { PrismaClient } from '@prisma/client'
import { hashPassword, comparePassword } from '../utils/password.js'
import { generateToken, generateRefreshToken } from '../utils/jwt.js'

const prisma = new PrismaClient()

const normalizeEmail = (email) => email.trim().toLowerCase()

export const register = async (req, res) => {
  try {
    const { email, password, name } = req.body

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, senha e nome são obrigatórios' })
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'A senha deve ter pelo menos 8 caracteres' })
    }

    const normalizedEmail = normalizeEmail(email)
    const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } })
    if (existingUser) {
      return res.status(409).json({ error: 'Email já registrado' })
    }

    // Cadastro público nunca concede privilégios administrativos.
    // Administradores devem ser provisionados por um fluxo controlado.
    const hashedPassword = await hashPassword(password)

    const user = await prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          email: normalizedEmail,
          password: hashedPassword,
          name: name.trim(),
          role: 'STUDENT',
          status: 'PENDING'
        }
      })

      await tx.student.create({ data: { userId: createdUser.id } })
      return createdUser
    })

    const token = generateToken(user.id, user.role)
    const refreshToken = generateRefreshToken(user.id)

    return res.status(201).json({
      message: 'Usuário criado e aguardando aprovação',
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

    const user = await prisma.user.findUnique({ where: { email: normalizeEmail(email) } })
    if (!user) {
      return res.status(401).json({ error: 'Email ou senha inválidos' })
    }

    const passwordValid = await comparePassword(password, user.password)
    if (!passwordValid) {
      return res.status(401).json({ error: 'Email ou senha inválidos' })
    }

    if (user.status === 'INACTIVE' || user.status === 'REJECTED') {
      return res.status(403).json({ error: 'Conta sem acesso. Entre em contato com a administração.' })
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
  return res.json({ message: 'Logout realizado com sucesso' })
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

    let studentId = null
    if (user.role === 'STUDENT') {
      const student = await prisma.student.findUnique({ where: { userId: user.id } })
      studentId = student?.id || null
    }

    return res.json({ ...user, studentId })
  } catch (error) {
    console.error('Erro ao buscar usuário:', error)
    return res.status(500).json({ error: 'Erro ao buscar usuário' })
  }
}
