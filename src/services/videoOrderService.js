export const videoOrderBy = [{ sortOrder: 'asc' }, { createdAt: 'desc' }, { title: 'asc' }, { id: 'asc' }]
const validIds = value => Array.isArray(value) && value.length <= 5000 && value.every(id => typeof id === 'string' && id.length > 0 && id.length <= 200) && new Set(value).size === value.length

export function createReorderVideos(prisma) {
  return async (req, res) => {
    const { ids, previousIds } = req.body || {}
    if (!validIds(ids) || !validIds(previousIds) || ids.length !== previousIds.length || ids.some(id => !previousIds.includes(id))) {
      return res.status(400).json({ error: 'Envie a lista completa de vídeos, sem repetições.' })
    }
    try {
      const videos = await prisma.$transaction(async tx => {
        const current = await tx.video.findMany({ orderBy: videoOrderBy })
        if (current.length !== previousIds.length || current.some((video, index) => video.id !== previousIds[index])) {
          const error = new Error('A biblioteca mudou. Atualize a lista e tente novamente.')
          error.status = 409
          throw error
        }
        for (const [sortOrder, id] of ids.entries()) await tx.video.update({ where: { id }, data: { sortOrder: sortOrder + 1 } })
        return tx.video.findMany({ orderBy: videoOrderBy })
      }, { isolationLevel: 'Serializable', timeout: 15000 })
      return res.json(videos)
    } catch (error) {
      if (error.status === 409 || error.code === 'P2034') return res.status(409).json({ error: 'A biblioteca mudou. Atualize a lista e tente novamente.' })
      console.error('Erro ao ordenar vídeos:', error)
      return res.status(500).json({ error: 'Não foi possível salvar a ordem dos vídeos.' })
    }
  }
}
