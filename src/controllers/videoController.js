import { PrismaClient } from '@prisma/client'
import { createNotifications } from '../services/notificationService.js'

const prisma = new PrismaClient()

function normalizeVideoPayload(body) {
  return {
    title: typeof body.title === 'string' ? body.title.trim() : '',
    description: typeof body.description === 'string' ? body.description.trim() : '',
    category: typeof body.category === 'string' ? body.category.trim() : '',
    videoUrl: typeof body.videoUrl === 'string' ? body.videoUrl.trim() : ''
  }
}

function validateVideoPayload(payload) {
  if (payload.title.length < 3 || payload.title.length > 120) return 'O título deve ter entre 3 e 120 caracteres'
  if (payload.description.length > 5000) return 'A descrição deve ter no máximo 5000 caracteres'
  if (payload.category.length > 80) return 'A categoria deve ter no máximo 80 caracteres'

  try {
    const url = new URL(payload.videoUrl)
    if (!['http:', 'https:'].includes(url.protocol)) return 'URL do vídeo inválida'
  } catch {
    return 'URL do vídeo inválida'
  }

  return null
}

export async function getVideos(req, res) {
  try {
    const videos = await prisma.video.findMany({ orderBy: [{ createdAt: 'desc' }, { title: 'asc' }] })
    return res.json(videos)
  } catch (error) {
    console.error('Erro ao buscar vídeos:', error)
    return res.status(500).json({ error: 'Erro ao buscar vídeos' })
  }
}

export async function createVideo(req, res) {
  try {
    const payload = normalizeVideoPayload(req.body)
    const validationError = validateVideoPayload(payload)
    if (validationError) return res.status(400).json({ error: validationError })

    const video = await prisma.$transaction(async (tx) => {
      const created = await tx.video.create({
        data: {
          title: payload.title,
          description: payload.description || null,
          category: payload.category || null,
          videoUrl: payload.videoUrl
        }
      })

      const approvedStudents = await tx.user.findMany({
        where: { role: 'STUDENT', status: 'APPROVED' },
        select: { id: true }
      })

      await createNotifications(tx, approvedStudents.map((student) => ({
        userId: student.id,
        title: 'Nova VideoAula disponível',
        message: `A aula “${created.title}” já está disponível na sua biblioteca de VideoAulas.`,
        type: 'VIDEO_CLASS_PUBLISHED'
      })))

      return created
    })

    return res.status(201).json(video)
  } catch (error) {
    console.error('Erro ao criar videoaula:', error)
    return res.status(500).json({ error: 'Erro ao criar videoaula' })
  }
}

export async function updateVideo(req, res) {
  try {
    const { videoId } = req.params
    const payload = normalizeVideoPayload(req.body)
    const validationError = validateVideoPayload(payload)
    if (validationError) return res.status(400).json({ error: validationError })

    const video = await prisma.video.update({
      where: { id: videoId },
      data: {
        title: payload.title,
        description: payload.description || null,
        category: payload.category || null,
        videoUrl: payload.videoUrl
      }
    })

    return res.json(video)
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Videoaula não encontrada' })
    console.error('Erro ao atualizar videoaula:', error)
    return res.status(500).json({ error: 'Erro ao atualizar videoaula' })
  }
}

export async function deleteVideo(req, res) {
  try {
    const { videoId } = req.params
    await prisma.video.delete({ where: { id: videoId } })
    return res.json({ message: 'Videoaula excluída com sucesso' })
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Videoaula não encontrada' })
    console.error('Erro ao excluir videoaula:', error)
    return res.status(500).json({ error: 'Erro ao excluir videoaula' })
  }
}
