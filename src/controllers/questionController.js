import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function getStudentForUser(userId) {
  return prisma.student.findUnique({ where: { userId }, select: { id: true } })
}

export async function getMyQuestions(req, res) {
  try {
    const student = await getStudentForUser(req.user.userId)
    if (!student) return res.status(404).json({ error: 'Aluno não encontrado' })

    const questions = await prisma.question.findMany({
      where: { studentId: student.id, userId: req.user.userId },
      include: { answer: true },
      orderBy: { createdAt: 'desc' }
    })

    return res.json(questions.map((question) => ({
      id: question.id,
      title: question.title,
      text: question.text,
      status: question.status,
      answer: question.answer?.text || null,
      answeredAt: question.answer?.createdAt || null,
      createdAt: question.createdAt,
      updatedAt: question.updatedAt
    })))
  } catch (error) {
    console.error('Erro ao buscar perguntas:', error)
    return res.status(500).json({ error: 'Erro ao buscar perguntas' })
  }
}

export async function createQuestion(req, res) {
  try {
    const text = typeof req.body.text === 'string' ? req.body.text.trim() : ''
    const title = typeof req.body.title === 'string' ? req.body.title.trim() : ''

    if (text.length < 3 || text.length > 5000) {
      return res.status(400).json({ error: 'A pergunta deve ter entre 3 e 5000 caracteres' })
    }

    const student = await getStudentForUser(req.user.userId)
    if (!student) return res.status(404).json({ error: 'Aluno não encontrado' })

    const question = await prisma.question.create({
      data: {
        studentId: student.id,
        userId: req.user.userId,
        title: title || text.slice(0, 80),
        text,
        status: 'PENDING'
      }
    })

    return res.status(201).json(question)
  } catch (error) {
    console.error('Erro ao criar pergunta:', error)
    return res.status(500).json({ error: 'Erro ao enviar pergunta' })
  }
}
