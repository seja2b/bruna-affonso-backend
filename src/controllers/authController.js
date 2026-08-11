const { prisma } = require('../config/database');
const { hashPassword, comparePassword } = require('../utils/password');
const { generateToken, generateRefreshToken } = require('../utils/jwt');

async function register(req, res) {
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password e name são obrigatórios' });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(400).json({ error: 'Email já registrado' });
    }

    const hashedPassword = await hashPassword(password);
    const user = await prisma.user.create({
      data: { email, password: hashedPassword, name, role: 'STUDENT' }
    });

    const token = generateToken(user.id, user.email);
    const refreshToken = generateRefreshToken(user.id);

    return res.status(201).json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      token, refreshToken
    });
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao registrar' });
  }
}

async function login(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email e password são obrigatórios' });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: 'Email ou senha incorretos' });
    }

    const isValid = await comparePassword(password, user.password);
    if (!isValid) {
      return res.status(401).json({ error: 'Email ou senha incorretos' });
    }

    const token = generateToken(user.id, user.email);
    const refreshToken = generateRefreshToken(user.id);

    return res.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      token, refreshToken
    });
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao fazer login' });
  }
}

async function getMe(req, res) {
  try {
    const userId = req.userId;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }
    return res.json({ id: user.id, email: user.email, name: user.name, role: user.role });
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao buscar usuário' });
  }
}

module.exports = { register, login, getMe };