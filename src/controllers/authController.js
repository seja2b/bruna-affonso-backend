const { prisma } = require('../config/database');
const { hashPassword, comparePassword } = require('../utils/password');
const { generateToken, generateRefreshToken } = require('../utils/jwt');

async function register(req, res) {
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, senha e nome são obrigatórios' });
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: 'Email já registrado' });
    }

    // Verificar se já existe ADMIN no banco
    const existingAdmin = await prisma.user.findFirst({
      where: { role: 'ADMIN' }
    });

    // Se não houver admin, o primeiro usuário vira ADMIN
    const role = !existingAdmin ? 'ADMIN' : 'STUDENT';
    const status = role === 'ADMIN' ? 'APPROVED' : 'PENDING';

    const hashedPassword = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        role,
        status
      }
    });

    // Criar registro de Student se for aluno
    if (role === 'STUDENT') {
      await prisma.student.create({
        data: { userId: user.id }
      });
    } else {
      // Criar registro de Admin se for admin
      await prisma.admin.create({
        data: { userId: user.id }
      });
    }

    const token = generateToken(user.id);
    const refreshToken = generateRefreshToken(user.id);

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
    });
  } catch (error) {
    console.error('Erro ao registrar:', error);
    return res.status(500).json({ error: 'Erro ao registrar usuário' });
  }
}

async function login(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email e senha são obrigatórios' });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: 'Email ou senha inválidos' });
    }

    const passwordValid = await comparePassword(password, user.password);
    if (!passwordValid) {
      return res.status(401).json({ error: 'Email ou senha inválidos' });
    }

    const token = generateToken(user.id);
    const refreshToken = generateRefreshToken(user.id);

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
    });
  } catch (error) {
    console.error('Erro ao fazer login:', error);
    return res.status(500).json({ error: 'Erro ao fazer login' });
  }
}

async function getMe(req, res) {
  try {
    const userId = req.userId;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, role: true, status: true, phone: true }
    });

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    return res.json(user);
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao buscar usuário' });
  }
}

module.exports = { register, login, getMe };