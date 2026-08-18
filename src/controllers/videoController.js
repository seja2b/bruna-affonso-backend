import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export async function getVideos(req, res) {
  try {
    const videos = await prisma.video.findMany({ orderBy: { createdAt: 'desc' } })
    return res.json(videos)
  } catch (error) {
    console.error('Erro ao buscar vídeos:', error)
    return res.status(500).json({ error: 'Erro ao buscar vídeos' })
  }
}
