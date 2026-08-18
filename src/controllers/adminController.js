const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// DASHBOARD
async function getDashboard(req, res) {
  try {
    const userId = req.user.userId;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    
    if (user?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Apenas admin' });
    }

    const totalStudents = await prisma.student.count();
    const pendingStudents = await prisma.user.count({ where: { role: 'STUDENT', status: 'PENDING' } });
    const totalWorkouts = await prisma.workout.count();
    const pendingQuestions = await prisma.question.count({ where: { status: 'PENDING' } });

    return res.json({
      totalStudents,
      pendingStudents,
      totalWorkouts,
      pendingQuestions
    });
  } catch (error) {
    console.error('Erro ao buscar dashboard:', error);
    return res.status(500).json({ error: 'Erro ao buscar dashboard' });
  }
}

// ALUNOS
async function getStudents(req, res) {
  try {
    // Retorna TODOS os alunos com seus status (PENDING, APPROVED, REJECTED, INACTIVE)
    const students = await prisma.user.findMany({
      where: { role: 'STUDENT' },
      select: { 
        id: true, 
        name: true, 
        email: true, 
        status: true, 
        phone: true, 
        profilePhoto: true,
        createdAt: true 
      },
      orderBy: { createdAt: 'desc' }
    });
    
    return res.json(students);
  } catch (error) {
    console.error('Erro ao buscar alunos:', error);
    return res.status(500).json({ error: 'Erro ao buscar alunos' });
  }
}

async function approveStudent(req, res) {
  try {
    const userId = req.user.userId;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    
    if (user?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Apenas admin' });
    }

    const { studentId } = req.params;
    const student = await prisma.user.update({
      where: { id: studentId },
      data: { status: 'APPROVED' }
    });

    return res.json({ message: 'Aluno aprovado', student });
  } catch (error) {
    console.error('Erro ao aprovar aluno:', error);
    return res.status(500).json({ error: 'Erro ao aprovar aluno' });
  }
}

async function rejectStudent(req, res) {
  try {
    const userId = req.user.userId;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    
    if (user?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Apenas admin' });
    }

    const { studentId } = req.params;
    const student = await prisma.user.update({
      where: { id: studentId },
      data: { status: 'REJECTED' }
    });

    return res.json({ message: 'Aluno rejeitado', student });
  } catch (error) {
    console.error('Erro ao rejeitar aluno:', error);
    return res.status(500).json({ error: 'Erro ao rejeitar aluno' });
  }
}

async function deactivateStudent(req, res) {
  try {
    const userId = req.user.userId;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    
    if (user?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Apenas admin' });
    }

    const { studentId } = req.params;
    const student = await prisma.user.update({
      where: { id: studentId },
      data: { status: 'INACTIVE' }
    });

    return res.json({ message: 'Aluno inativado', student });
  } catch (error) {
    console.error('Erro ao inativar aluno:', error);
    return res.status(500).json({ error: 'Erro ao inativar aluno' });
  }
}

async function reactivateStudent(req, res) {
  try {
    const userId = req.user.userId;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    
    if (user?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Apenas admin' });
    }

    const { studentId } = req.params;
    const student = await prisma.user.update({
      where: { id: studentId },
      data: { status: 'APPROVED' }
    });

    return res.json({ message: 'Aluno reativado', student });
  } catch (error) {
    console.error('Erro ao reativar aluno:', error);
    return res.status(500).json({ error: 'Erro ao reativar aluno' });
  }
}

// CATEGORIAS
async function getCategories(req, res) {
  try {
    const categories = await prisma.category.findMany();
    return res.json(categories);
  } catch (error) {
    console.error('Erro ao buscar categorias:', error);
    return res.status(500).json({ error: 'Erro ao buscar categorias' });
  }
}

async function createCategory(req, res) {
  try {
    const userId = req.user.userId;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    
    if (user?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Apenas admin' });
    }

    const { name, description } = req.body;
    const category = await prisma.category.create({
      data: { name, description }
    });

    return res.status(201).json(category);
  } catch (error) {
    console.error('Erro ao criar categoria:', error);
    return res.status(500).json({ error: 'Erro ao criar categoria' });
  }
}

// TREINOS (ADMIN)
async function createWorkoutAdmin(req, res) {
  try {
    const userId = req.user.userId;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    
    if (user?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Apenas admin' });
    }

    const { title, description, categoryId, videoUrl, week, module, coverImage, status } = req.body;

    const workout = await prisma.workout.create({
      data: {
        title,
        description,
        categoryId,
        videoUrl,
        week,
        module,
        coverImage,
        status
      }
    });

    return res.status(201).json(workout);
  } catch (error) {
    console.error('Erro ao criar treino:', error);
    return res.status(500).json({ error: 'Erro ao criar treino' });
  }
}

async function updateWorkoutAdmin(req, res) {
  try {
    const userId = req.user.userId;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    
    if (user?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Apenas admin' });
    }

    const { workoutId } = req.params;
    const { title, description, categoryId, videoUrl, week, module, coverImage, status } = req.body;

    const workout = await prisma.workout.update({
      where: { id: workoutId },
      data: {
        title,
        description,
        categoryId,
        videoUrl,
        week,
        module,
        coverImage,
        status
      }
    });

    return res.json(workout);
  } catch (error) {
    console.error('Erro ao atualizar treino:', error);
    return res.status(500).json({ error: 'Erro ao atualizar treino' });
  }
}

async function deleteWorkoutAdmin(req, res) {
  try {
    const userId = req.user.userId;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    
    if (user?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Apenas admin' });
    }

    const { workoutId } = req.params;
    await prisma.workout.delete({ where: { id: workoutId } });

    return res.json({ message: 'Treino deletado' });
  } catch (error) {
    console.error('Erro ao deletar treino:', error);
    return res.status(500).json({ error: 'Erro ao deletar treino' });
  }
}

// PERGUNTAS
async function getPendingQuestions(req, res) {
  try {
    const questions = await prisma.question.findMany({
      where: { status: 'PENDING' },
      include: { user: true }
    });
    return res.json(questions);
  } catch (error) {
    console.error('Erro ao buscar perguntas:', error);
    return res.status(500).json({ error: 'Erro ao buscar perguntas' });
  }
}

async function answerQuestion(req, res) {
  try {
    const userId = req.user.userId;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    
    if (user?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Apenas admin' });
    }

    const { questionId } = req.params;
    const { text } = req.body;

    const answer = await prisma.answer.create({
      data: { questionId, text }
    });

    await prisma.question.update({
      where: { id: questionId },
      data: { status: 'ANSWERED' }
    });

    return res.status(201).json(answer);
  } catch (error) {
    console.error('Erro ao responder pergunta:', error);
    return res.status(500).json({ error: 'Erro ao responder pergunta' });
  }
}

// CONFIGURAÇÕES
async function getSettings(req, res) {
  try {
    let settings = await prisma.adminSettings.findFirst();
    if (!settings) {
      settings = await prisma.adminSettings.create({
        data: {}
      });
    }
    return res.json(settings);
  } catch (error) {
    console.error('Erro ao buscar configurações:', error);
    return res.status(500).json({ error: 'Erro ao buscar configurações' });
  }
}

async function updateSettings(req, res) {
  try {
    const userId = req.user.userId;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    
    if (user?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Apenas admin' });
    }

    const { phone, whatsappUrl, motivationalPhrase, profileImage, logo } = req.body;

    let settings = await prisma.adminSettings.findFirst();
    if (!settings) {
      settings = await prisma.adminSettings.create({
        data: { phone, whatsappUrl, motivationalPhrase, profileImage, logo }
      });
    } else {
      settings = await prisma.adminSettings.update({
        where: { id: settings.id },
        data: { phone, whatsappUrl, motivationalPhrase, profileImage, logo }
      });
    }

    return res.json(settings);
  } catch (error) {
    console.error('Erro ao atualizar configurações:', error);
    return res.status(500).json({ error: 'Erro ao atualizar configurações' });
  }
}

module.exports = {
  getDashboard,
  getStudents,
  approveStudent,
  rejectStudent,
  deactivateStudent,
  reactivateStudent,
  getCategories,
  createCategory,
  createWorkoutAdmin,
  updateWorkoutAdmin,
  deleteWorkoutAdmin,
  getPendingQuestions,
  answerQuestion,
  getSettings,
  updateSettings
};