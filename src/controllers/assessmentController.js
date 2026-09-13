import fs from 'node:fs'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import { strengthResults, strengthComparison, previousCycle } from '../services/strengthResultsService.js'
import { AssessmentError } from '../services/assessmentValidationService.js'
import { STAGES, blankStatuses, stageUpdate, persistCycleUpdate, lockCycle } from '../services/assessmentCycleService.js'

export function createAssessmentHandlers(prisma) {
  const PHOTO_VIEWS = ['FRONT', 'BACK', 'RIGHT', 'LEFT', 'FRONT_RELAXED', 'BACK_RELAXED', 'RIGHT_RELAXED', 'LEFT_RELAXED', 'FRONT_DETAIL', 'BACK_DETAIL', 'RIGHT_DETAIL', 'LEFT_DETAIL', 'FRONT_FOURTH', 'BACK_FOURTH', 'RIGHT_FOURTH', 'LEFT_FOURTH', 'FRONT_FIFTH', 'BACK_FIFTH', 'RIGHT_FIFTH', 'LEFT_FIFTH', 'POSTERIOR_RIGHT', 'POSTERIOR_LEFT', 'DEEP_SQUAT']
  const deadline = () => new Date(Date.now() + 7 * 86400000)
  async function studentForUser(userId) { return prisma.student.findUnique({ where: { userId }, select: { id: true } }) }
  async function ownedCycle(req, cycleId, include = {}) {
    const where = { id: cycleId }
    if (req.user.role === 'STUDENT') {
      const student = await studentForUser(req.user.userId)
      if (!student) return null
      where.studentId = student.id
    }
    return prisma.assessmentCycle.findFirst({ where, include })
  }
  function serialize(cycle, reference = null) {
    const statuses = cycle.stageStatuses || blankStatuses()
    const completed = STAGES.filter((stage) => statuses[stage] === 'COMPLETED').length
    return { ...cycle, strengthResults: strengthResults(cycle), strengthComparison: strengthComparison(cycle, reference), progress: completed * 20, daysRemaining: Math.max(0, Math.ceil((new Date(cycle.deadlineAt) - Date.now()) / 86400000)), expired: new Date(cycle.deadlineAt) < new Date() && cycle.status !== 'COMPLETED', photos: (cycle.photos || []).map(({ storageKey, ...photo }) => ({ ...photo, url: `/assessments/photos/${photo.id}` })) }
  }
  function serializeCycles(cycles) { return cycles.map((cycle) => serialize(cycle, previousCycle(cycles, cycle))) }
  async function serializeWithPrevious(cycle) {
    const previous = await prisma.assessmentCycle.findFirst({ where: { studentId: cycle.studentId, sequence: { lt: cycle.sequence } }, orderBy: { sequence: 'desc' } })
    return serialize(cycle, previous)
  }
  async function getMyAssessments(req, res) {
    try {
      const student = await studentForUser(req.user.userId)
      if (!student) return res.status(404).json({ error: 'Perfil de aluna não encontrado' })
      let initial = await prisma.assessmentCycle.findUnique({ where: { studentId_sequence: { studentId: student.id, sequence: 0 } } })
      if (!initial) initial = await prisma.assessmentCycle.create({ data: { studentId: student.id, deadlineAt: deadline(), stageStatuses: blankStatuses() } })
      const [cycles, videos] = await Promise.all([prisma.assessmentCycle.findMany({ where: { studentId: student.id }, include: { photos: true }, orderBy: { sequence: 'asc' } }), prisma.assessmentVideo.findMany({ orderBy: { stage: 'asc' } })])
      return res.json({ cycles: serializeCycles(cycles), videos })
    } catch (error) { console.error('Erro ao buscar avaliações:', error); return res.status(500).json({ error: 'Erro ao buscar avaliações' }) }
  }
  async function markAssessmentIntroductionSeen(req, res) {
    const student = await studentForUser(req.user.userId)
    if (!student) return res.status(404).json({ error: 'Perfil de aluna não encontrado' })
    const updated = await prisma.student.update({ where: { id: student.id }, data: { assessmentIntroSeenAt: new Date() }, select: { assessmentIntroSeenAt: true } })
    return res.json(updated)
  }
  async function saveStage(req, res) {
    try {
      const stage = String(req.params.stage || '').toUpperCase()
      if (!STAGES.includes(stage) || stage === 'POSTURAL') return res.status(400).json({ error: 'Etapa inválida' })
      const cycle = await ownedCycle(req, req.params.cycleId, { photos: true })
      if (!cycle) return res.status(404).json({ error: 'Avaliação não encontrada' })
      const updated = await prisma.$transaction(async (tx) => {
        const current = await lockCycle(tx, cycle.id)
        return persistCycleUpdate(tx, current, stageUpdate(current, stage, req.body))
      })
      return res.json(await serializeWithPrevious(updated))
    } catch (error) { if (error instanceof AssessmentError) return res.status(error.status).json({ error: error.message }); console.error('Erro ao salvar avaliação:', error); return res.status(500).json({ error: 'Erro ao salvar avaliação' }) }
  }
  async function uploadPhoto(req, res) {
    let committed = false
    try {
      const view = String(req.params.view || '').toUpperCase()
      if (!PHOTO_VIEWS.includes(view)) throw new AssessmentError('Ângulo de foto inválido')
      const cycle = await ownedCycle(req, req.params.cycleId, { photos: true })
      if (!cycle || req.user.role !== 'STUDENT') throw new AssessmentError('Avaliação não encontrada', 404)
      if (!req.file) throw new AssessmentError('Selecione uma imagem JPG, PNG ou WebP')
      const { photo, existing } = await prisma.$transaction(async (tx) => {
        const current = await lockCycle(tx, cycle.id)
        const existing = current.photos.find((item) => item.view === view)
        const file = { storageKey: req.file.filename, originalName: req.file.originalname, mimeType: req.file.mimetype, size: req.file.size }
        const photo = await tx.assessmentPhoto.upsert({ where: { cycleId_view: { cycleId: cycle.id, view } }, update: file, create: { cycleId: cycle.id, view, ...file } })
        const views = new Set([...current.photos.map((item) => item.view), view])
        const complete = PHOTO_VIEWS.every((item) => views.has(item))
        await persistCycleUpdate(tx, current, { stageStatuses: { ...blankStatuses(), ...current.stageStatuses, POSTURAL: complete ? 'COMPLETED' : 'IN_PROGRESS' } })
        return { photo, existing }
      })
      committed = true
      if (existing && existing.storageKey !== req.file.filename) fs.promises.unlink(path.join(req.file.destination, existing.storageKey)).catch(() => {})
      return res.status(201).json({ id: photo.id, view: photo.view, url: `/assessments/photos/${photo.id}` })
    } catch (error) { if (req.file && !committed) await fs.promises.unlink(req.file.path).catch(() => {}); if (error instanceof AssessmentError) return res.status(error.status).json({ error: error.message }); console.error('Erro ao enviar foto:', error); return res.status(500).json({ error: 'Erro ao enviar foto' }) }
  }
  async function getPrivatePhoto(req, res) {
    const photo = await prisma.assessmentPhoto.findUnique({ where: { id: req.params.photoId }, include: { cycle: true } })
    if (!photo) return res.status(404).json({ error: 'Foto não encontrada' })
    if (req.user.role === 'STUDENT') { const student = await studentForUser(req.user.userId); if (!student || photo.cycle.studentId !== student.id) return res.status(403).json({ error: 'Acesso não autorizado' }) }
    const filePath = path.resolve(process.env.ASSESSMENT_UPLOAD_DIR || 'private_uploads/assessments', photo.storageKey)
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Arquivo não encontrado' })
    res.set({ 'Content-Type': photo.mimeType, 'Cache-Control': 'private, no-store', 'Content-Disposition': `inline; filename="${encodeURIComponent(photo.originalName)}"` })
    return res.sendFile(filePath)
  }
  async function getAdminAssessments(req, res) {
    const student = await prisma.student.findUnique({ where: { id: req.params.studentId }, include: { user: { select: { id: true, name: true, email: true } } } })
    if (!student) return res.status(404).json({ error: 'Aluna não encontrada' })
    await prisma.assessmentCycle.upsert({ where: { studentId_sequence: { studentId: student.id, sequence: 0 } }, update: {}, create: { studentId: student.id, deadlineAt: deadline(), stageStatuses: blankStatuses() } })
    const [cycles, videos] = await Promise.all([prisma.assessmentCycle.findMany({ where: { studentId: student.id }, include: { photos: true }, orderBy: { sequence: 'asc' } }), prisma.assessmentVideo.findMany({ orderBy: { stage: 'asc' } })])
    return res.json({ student: student.user, cycles: serializeCycles(cycles), videos })
  }
  async function releaseReassessment(req, res) {
    const student = await prisma.student.findUnique({ where: { id: req.params.studentId } })
    if (!student) return res.status(404).json({ error: 'Aluna não encontrada' })
    const latest = await prisma.assessmentCycle.findFirst({ where: { studentId: student.id }, orderBy: { sequence: 'desc' } })
    if (latest && latest.status !== 'COMPLETED') return res.status(409).json({ error: 'Conclua o ciclo atual antes de liberar outro' })
    const sequence = (latest?.sequence || 0) + 1
    const limit = student.packageType === 'SEMIANNUAL' ? 4 : 2
    if (sequence > limit) return res.status(409).json({ error: `O plano permite no máximo ${limit} reavaliações neste ciclo` })
    return res.status(201).json(serialize(await prisma.assessmentCycle.create({ data: { studentId: student.id, type: 'REASSESSMENT', sequence, deadlineAt: deadline(), stageStatuses: blankStatuses() }, include: { photos: true } }), latest))
  }
  async function getVideos(req, res) { return res.json(await prisma.assessmentVideo.findMany({ orderBy: { stage: 'asc' } })) }
  async function updateVideos(req, res) {
    const videos = req.body?.videos
    if (!videos || typeof videos !== 'object') return res.status(400).json({ error: 'Informe os vídeos por etapa' })
    for (const stage of STAGES) { const youtubeUrl = typeof videos[stage] === 'string' ? videos[stage].trim().slice(0, 2000) : ''; if (youtubeUrl && !/^https:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(youtubeUrl)) return res.status(400).json({ error: `Link do YouTube inválido em ${stage}` }); await prisma.assessmentVideo.upsert({ where: { stage }, update: { youtubeUrl: youtubeUrl || null }, create: { stage, youtubeUrl: youtubeUrl || null } }) }
    return getVideos(req, res)
  }

  return { getMyAssessments, markAssessmentIntroductionSeen, saveStage, uploadPhoto, getPrivatePhoto, getAdminAssessments, releaseReassessment, getVideos, updateVideos }
}

export const { getMyAssessments, markAssessmentIntroductionSeen, saveStage, uploadPhoto, getPrivatePhoto, getAdminAssessments, releaseReassessment, getVideos, updateVideos } = createAssessmentHandlers(new PrismaClient())
