import { PrismaClient } from '@prisma/client'
import { hashPassword, comparePassword } from '../utils/password.js'
import { generateToken, generateRefreshToken, verifyRefreshToken } from '../utils/jwt.js'
import {
  clearRefreshCookie,
  getRefreshTokenFromRequest,
  isUserAllowedToAuthenticate,
  issueRefreshSession,
  migrateLegacyRefreshSession,
  revokeRefreshSession,
  rotateRefreshSession,
  setRefreshCookie
} from '../services/refreshSessionService.js'

const prisma = new PrismaClient()

const normalizeEmail = (email) => email.trim().toLowerCase()
const legacyMigrationEnabled = () => process.env.LEGACY_REFRESH_MIGRATION_ENABLED !== 'false'

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

    return res.status(201).json({
      message: 'Cadastro recebido. Aguarde a aprovação da administração antes de entrar na plataforma.',
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

    if (!isUserAllowedToAuthenticate(user)) {
      if (user.role === 'STUDENT' && user.status === 'PENDING') {
        return res.status(403).json({ error: 'Seu cadastro ainda está aguardando aprovação.' })
      }
      return res.status(403).json({ error: 'Conta sem acesso. Entre em contato com a administração.' })
    }

    const refreshToken = await issueRefreshSession(prisma, user.id, req)
    setRefreshCookie(res, refreshToken)

    const payload = {
      token: generateToken(user.id, user.role),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        status: user.status
      }
    }

    // Compatibilidade temporária apenas para builds antigos do frontend, que não enviam
    // o header de sessão. Builds novos nunca recebem o refresh JWT no JavaScript.
    if (legacyMigrationEnabled() && req.get('X-Requested-With') !== 'XMLHttpRequest') {
      payload.refreshToken = generateRefreshToken(user.id)
    }

    return res.json(payload)
  } catch (error) {
    console.error('Erro ao fazer login:', error)
    return res.status(500).json({ error: 'Erro ao fazer login' })
  }
}

export const refreshSession = async (req, res) => {
  try {
    const cookieToken = getRefreshTokenFromRequest(req)

    if (cookieToken) {
      const rotated = await rotateRefreshSession(prisma, cookieToken, req)
      if (!rotated.ok) {
        clearRefreshCookie(res)
        return res.status(401).json({ error: 'Sessão inválida ou expirada' })
      }

      setRefreshCookie(res, rotated.rawToken)
      return res.json({ token: generateToken(rotated.user.id, rotated.user.role) })
    }

    const legacyToken = typeof req.body?.refreshToken === 'string' ? req.body.refreshToken.trim() : ''
    if (!legacyToken || !legacyMigrationEnabled()) {
      clearRefreshCookie(res)
      return res.status(401).json({ error: 'Sessão de renovação ausente' })
    }

    const decoded = verifyRefreshToken(legacyToken)
    if (!decoded?.userId) {
      return res.status(401).json({ error: 'Refresh token legado inválido ou expirado' })
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, role: true, status: true }
    })

    if (!isUserAllowedToAuthenticate(user)) {
      return res.status(401).json({ error: 'Sessão não autorizada' })
    }

    const migrated = await migrateLegacyRefreshSession(prisma, legacyToken, user.id, req)
    if (!migrated.ok) {
      return res.status(401).json({ error: 'Refresh token legado já migrado' })
    }

    setRefreshCookie(res, migrated.rawToken)
    return res.json({ token: generateToken(user.id, user.role), migrated: true })
  } catch (error) {
    console.error('Erro ao renovar sessão:', error)
    return res.status(500).json({ error: 'Erro ao renovar sessão' })
  }
}

export const logout = async (req, res) => {
  try {
    const cookieToken = getRefreshTokenFromRequest(req)
    await revokeRefreshSession(prisma, cookieToken)
    clearRefreshCookie(res)
    return res.json({ message: 'Logout realizado com sucesso' })
  } catch (error) {
    console.error('Erro ao encerrar sessão:', error)
    clearRefreshCookie(res)
    return res.json({ message: 'Logout realizado com sucesso' })
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

export const updateMe = async (req, res) => {
  try {
    const userId = req.user.userId
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : ''
    const phone = typeof req.body.phone === 'string' ? req.body.phone.trim() : ''
    const profilePhoto = typeof req.body.profilePhoto === 'string' ? req.body.profilePhoto.trim() : ''

    if (name.length < 2 || name.length > 120) {
      return res.status(400).json({ error: 'O nome deve ter entre 2 e 120 caracteres' })
    }

    if (phone.length > 30) {
      return res.status(400).json({ error: 'Telefone inválido' })
    }

    if (profilePhoto && profilePhoto.length > 5_000_000) {
      return res.status(400).json({ error: 'Foto de perfil muito grande' })
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        name,
        phone: phone || null,
        profilePhoto: profilePhoto || null
      },
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

    let studentId = null
    if (updated.role === 'STUDENT') {
      const student = await prisma.student.findUnique({ where: { userId: updated.id }, select: { id: true } })
      studentId = student?.id || null
    }

    return res.json({ ...updated, studentId })
  } catch (error) {
    console.error('Erro ao atualizar perfil:', error)
    return res.status(500).json({ error: 'Erro ao atualizar perfil' })
  }
}
