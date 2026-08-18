import { PrismaClient } from '@prisma/client'
import { createNotification } from '../services/notificationService.js'

const prisma = new PrismaClient()

export async function getAdminQuestions(req, res) {
  try {
    const questions = await prisma.question.findMany({
      include: {
        answer: true,
        user: { select: { id: true, name: true, email: true, profilePhoto: true } }
      },
      orderBy: { createdAt: 'desc' }
    })

    return res.json(questions.map((question) => ({
      id: question.id,
      title: question.title,
      text: question.text,
      status: question.status,
      createdAt: question.createdAt,
      updatedAt: question.updatedAt,
      answeredAt: question.answer?.createdAt || null,
      answer: question.answer?.text || null,
      user: question.user
    })))
  } catch (error) {
    console.error('Erro ao buscar perguntas do admin:', error)
    return res.status(500).json({ error: 'Erro ao buscar perguntas' })
  }
}

export async function answerQuestionWithNotification(req, res) {
  try {
    const { questionId } = req.params
    const text = typeof req.body.text === 'string' ? req.body.text.trim() : ''
    if (!text) return res.status(400).json({ error: 'Resposta é obrigatória' })

    const question = await prisma.question.findUnique({
      where: { id: questionId },
      select: { id: true, title: true, userId: true }
    })
    if (!question) return res.status(404).json({ error: 'Pergunta não encontrada' })

    const answer = await prisma.$transaction(async (tx) => {
      const savedAnswer = await tx.answer.upsert({
        where: { questionId },
        update: { text },
        create: { questionId, text }
      })

      await tx.question.update({ where: { id: questionId }, data: { status: 'ANSWERED' } })

      await createNotification(tx, {
        userId: question.userId,
        title: 'Sua pergunta foi respondida',
        message: question.title ? `A professora respondeu: ${question.title}` : 'A professora respondeu uma de suas perguntas.',
        type: 'QUESTION_ANSWERED'
      })

      return savedAnswer
    })

    return res.status(201).json(answer)
  } catch (error) {
    console.error('Erro ao responder pergunta:', error)
    return res.status(500).json({ error: 'Erro ao responder pergunta' })
  }
}
