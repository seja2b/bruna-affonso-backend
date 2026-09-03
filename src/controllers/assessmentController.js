import fs from 'node:fs'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const STAGES = ['ANAMNESIS', 'BODY', 'POSTURAL', 'STRENGTH', 'ENDURANCE']
const PHOTO_VIEWS = ['FRONT', 'BACK', 'RIGHT', 'LEFT', 'FRONT_RELAXED', 'BACK_RELAXED', 'RIGHT_RELAXED', 'LEFT_RELAXED', 'FRONT_DETAIL', 'BACK_DETAIL', 'RIGHT_DETAIL', 'LEFT_DETAIL']
const EXERCISES = ['smithSquat', 'closeGripPulldown', 'seatedDumbbellPress', 'deadlift']
const blankStatuses = () => Object.fromEntries(STAGES.map((stage) => [stage, 'PENDING']))
const deadline = () => new Date(Date.now() + 7 * 86400000)
const finite = (value, min = 0, max = 100000) => {
  const number = Number(value)
  return Number.isFinite(number) && number >= min && number <= max ? number : null
}
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
function serialize(cycle) {
  const statuses = cycle.stageStatuses || blankStatuses()
  const completed = STAGES.filter((stage) => statuses[stage] === 'COMPLETED').length
  return { ...cycle, progress: completed * 20, daysRemaining: Math.max(0, Math.ceil((new Date(cycle.deadlineAt) - Date.now()) / 86400000)), expired: new Date(cycle.deadlineAt) < new Date() && cycle.status !== 'COMPLETED', photos: (cycle.photos || []).map(({ storageKey, ...photo }) => ({ ...photo, url: `/assessments/photos/${photo.id}` })) }
}
const textValue = (input, key, max = 1500) => typeof input[key] === 'string' ? input[key].trim().slice(0, max) : ''
function sanitizeAnamnesis(input = {}) {
  const textFields = ['motivationAndInstagram', 'personalTrainerExperience', 'routine', 'trainingDifficulties', 'sleepQuality', 'nutrition', 'smokingAndAlcohol', 'healthAndMedication', 'currentSymptoms', 'injuryHistory', 'surgeryHistory', 'allergies', 'currentPain', 'effortDiscomfort', 'goals', 'bodyPerception', 'currentExercises', 'cardio', 'trainingLocation', 'muscleEmphasis', 'effortPreference', 'exercisePreferences', 'methodPreferences', 'relevantNotes', 'routineChanges', 'wellbeingChanges', 'workoutFeedback', 'currentBodyPerception']
  const result = Object.fromEntries(textFields.map((key) => [key, textValue(input, key, 3500)]))
  return { ...result, fatigueLevel: finite(input.fatigueLevel, 0, 10), sleepHours: finite(input.sleepHours, 0, 24), waterLiters: finite(input.waterLiters, 0, 20), weeklyFrequency: finite(input.weeklyFrequency, 0, 14), trainingMinutes: finite(input.trainingMinutes, 0, 600), trainingDedicationScore: finite(input.trainingDedicationScore, 0, 10), nutritionHydrationScore: finite(input.nutritionHydrationScore, 0, 10) }
}
function sanitizeBody(input = {}) { return Object.fromEntries(['weightKg', 'heightCm', 'waistCm', 'hipCm', 'rightArmCm', 'leftArmCm', 'rightThighCm', 'leftThighCm'].map((key) => [key, finite(input[key], 0, 500)])) }
function sanitizeStrength(input = {}) {
  return Object.fromEntries(EXERCISES.map((key) => { const loadKg = finite(input[key]?.loadKg, 0, 1000); const repetitions = finite(input[key]?.repetitions, 1, 100); return [key, { loadKg, repetitions, estimatedOneRm: loadKg !== null && repetitions !== null ? Number((loadKg * (1 + repetitions / 30)).toFixed(2)) : null }] }))
}
function sanitizeEndurance(input = {}) {
  const distanceMeters = finite(input.distanceMeters, 0, 100000)
  return { modality: ['BIKE', 'TREADMILL'].includes(input.modality) ? input.modality : null, distanceMeters, vamKmh: distanceMeters === null ? null : Number((distanceMeters / 83.33).toFixed(2)), pushUps: finite(input.pushUps, 0, 10000), plankSeconds: finite(input.plankSeconds, 0, 86400), abdominalReps: finite(input.abdominalReps, 0, 10000) }
}
export async function getMyAssessments(req, res) {
  try {
    const student = await studentForUser(req.user.userId)
    if (!student) return res.status(404).json({ error: 'Perfil de aluna não encontrado' })
    let initial = await prisma.assessmentCycle.findUnique({ where: { studentId_sequence: { studentId: student.id, sequence: 0 } } })
    if (!initial) initial = await prisma.assessmentCycle.create({ data: { studentId: student.id, deadlineAt: deadline(), stageStatuses: blankStatuses() } })
    const [cycles, videos] = await Promise.all([prisma.assessmentCycle.findMany({ where: { studentId: student.id }, include: { photos: true }, orderBy: { sequence: 'asc' } }), prisma.assessmentVideo.findMany({ orderBy: { stage: 'asc' } })])
    return res.json({ cycles: cycles.map(serialize), videos })
  } catch (error) { console.error('Erro ao buscar avaliações:', error); return res.status(500).json({ error: 'Erro ao buscar avaliações' }) }
}
export async function markAssessmentIntroductionSeen(req, res) {
  const student = await studentForUser(req.user.userId)
  if (!student) return res.status(404).json({ error: 'Perfil de aluna não encontrado' })
  const updated = await prisma.student.update({ where: { id: student.id }, data: { assessmentIntroSeenAt: new Date() }, select: { assessmentIntroSeenAt: true } })
  return res.json(updated)
}
export async function saveStage(req, res) {
  try {
    const stage = String(req.params.stage || '').toUpperCase()
    if (!STAGES.includes(stage) || stage === 'POSTURAL') return res.status(400).json({ error: 'Etapa inválida' })
    const cycle = await ownedCycle(req, req.params.cycleId, { photos: true })
    if (!cycle) return res.status(404).json({ error: 'Avaliação não encontrada' })
    if (new Date(cycle.deadlineAt) < new Date() || cycle.status === 'COMPLETED') return res.status(409).json({ error: 'O ciclo não aceita mais alterações' })
    const complete = req.body.complete === true
    const statuses = { ...blankStatuses(), ...(cycle.stageStatuses || {}), [stage]: complete ? 'COMPLETED' : 'IN_PROGRESS' }
    const data = { stageStatuses: statuses }
    if (stage === 'ANAMNESIS') { data.anamnesis = sanitizeAnamnesis(req.body.data); if (req.body.healthConsent === true && !cycle.healthConsentAt) data.healthConsentAt = new Date(); if (complete && !data.healthConsentAt && !cycle.healthConsentAt) return res.status(400).json({ error: 'Confirme o tratamento dos dados sensíveis para concluir' }) }
    if (stage === 'BODY') data.bodyAssessment = sanitizeBody(req.body.data)
    if (stage === 'STRENGTH') data.strengthTest = sanitizeStrength(req.body.data)
    if (stage === 'ENDURANCE') data.enduranceTest = sanitizeEndurance(req.body.data)
    const finished = STAGES.every((item) => statuses[item] === 'COMPLETED')
    if (finished) Object.assign(data, { status: 'COMPLETED', completedAt: new Date() })
    const updated = await prisma.$transaction(async (tx) => {
      let saved = await tx.assessmentCycle.update({ where: { id: cycle.id }, data, include: { photos: true } })
      if (finished && cycle.sequence > 0 && !cycle.pointsAwarded) {
        const award = await tx.assessmentCycle.updateMany({ where: { id: cycle.id, pointsAwarded: false }, data: { pointsAwarded: true } })
        if (award.count) await tx.studentRanking.upsert({ where: { studentId: cycle.studentId }, create: { studentId: cycle.studentId, totalPoints: 100 }, update: { totalPoints: { increment: 100 } } })
        saved = await tx.assessmentCycle.findUnique({ where: { id: cycle.id }, include: { photos: true } })
      }
      return saved
    })
    return res.json(serialize(updated))
  } catch (error) { console.error('Erro ao salvar avaliação:', error); return res.status(500).json({ error: 'Erro ao salvar avaliação' }) }
}
export async function uploadPhoto(req, res) {
  try {
    const view = String(req.params.view || '').toUpperCase()
    if (!PHOTO_VIEWS.includes(view)) return res.status(400).json({ error: 'Ângulo de foto inválido' })
    const cycle = await ownedCycle(req, req.params.cycleId, { photos: true })
    if (!cycle || req.user.role !== 'STUDENT') return res.status(404).json({ error: 'Avaliação não encontrada' })
    if (!req.file) return res.status(400).json({ error: 'Selecione uma imagem JPG, PNG ou WebP' })
    if (new Date(cycle.deadlineAt) < new Date() || cycle.status === 'COMPLETED') return res.status(409).json({ error: 'O ciclo não aceita mais alterações' })
    const existing = cycle.photos.find((photo) => photo.view === view)
    const photo = await prisma.assessmentPhoto.upsert({ where: { cycleId_view: { cycleId: cycle.id, view } }, update: { storageKey: req.file.filename, originalName: req.file.originalname, mimeType: req.file.mimetype, size: req.file.size }, create: { cycleId: cycle.id, view, storageKey: req.file.filename, originalName: req.file.originalname, mimeType: req.file.mimetype, size: req.file.size } })
    if (existing && existing.storageKey !== req.file.filename) fs.promises.unlink(path.join(req.file.destination, existing.storageKey)).catch(() => {})
    const count = await prisma.assessmentPhoto.count({ where: { cycleId: cycle.id } })
    await prisma.assessmentCycle.update({ where: { id: cycle.id }, data: { stageStatuses: { ...blankStatuses(), ...(cycle.stageStatuses || {}), POSTURAL: count === 12 ? 'COMPLETED' : 'IN_PROGRESS' } } })
    return res.status(201).json({ id: photo.id, view: photo.view, url: `/assessments/photos/${photo.id}` })
  } catch (error) { if (req.file) fs.promises.unlink(req.file.path).catch(() => {}); console.error('Erro ao enviar foto:', error); return res.status(500).json({ error: 'Erro ao enviar foto' }) }
}
export async function getPrivatePhoto(req, res) {
  const photo = await prisma.assessmentPhoto.findUnique({ where: { id: req.params.photoId }, include: { cycle: true } })
  if (!photo) return res.status(404).json({ error: 'Foto não encontrada' })
  if (req.user.role === 'STUDENT') { const student = await studentForUser(req.user.userId); if (!student || photo.cycle.studentId !== student.id) return res.status(403).json({ error: 'Acesso não autorizado' }) }
  const filePath = path.resolve(process.env.ASSESSMENT_UPLOAD_DIR || 'private_uploads/assessments', photo.storageKey)
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Arquivo não encontrado' })
  res.set({ 'Content-Type': photo.mimeType, 'Cache-Control': 'private, no-store', 'Content-Disposition': `inline; filename="${encodeURIComponent(photo.originalName)}"` })
  return res.sendFile(filePath)
}
export async function getAdminAssessments(req, res) {
  const student = await prisma.student.findUnique({ where: { id: req.params.studentId }, include: { user: { select: { id: true, name: true, email: true } } } })
  if (!student) return res.status(404).json({ error: 'Aluna não encontrada' })
  await prisma.assessmentCycle.upsert({ where: { studentId_sequence: { studentId: student.id, sequence: 0 } }, update: {}, create: { studentId: student.id, deadlineAt: deadline(), stageStatuses: blankStatuses() } })
  const [cycles, videos] = await Promise.all([prisma.assessmentCycle.findMany({ where: { studentId: student.id }, include: { photos: true }, orderBy: { sequence: 'asc' } }), prisma.assessmentVideo.findMany({ orderBy: { stage: 'asc' } })])
  return res.json({ student: student.user, cycles: cycles.map(serialize), videos })
}
export async function releaseReassessment(req, res) {
  const student = await prisma.student.findUnique({ where: { id: req.params.studentId } })
  if (!student) return res.status(404).json({ error: 'Aluna não encontrada' })
  const latest = await prisma.assessmentCycle.findFirst({ where: { studentId: student.id }, orderBy: { sequence: 'desc' } })
  if (latest && latest.status !== 'COMPLETED') return res.status(409).json({ error: 'Conclua o ciclo atual antes de liberar outro' })
  const sequence = (latest?.sequence || 0) + 1
  return res.status(201).json(serialize(await prisma.assessmentCycle.create({ data: { studentId: student.id, type: 'REASSESSMENT', sequence, deadlineAt: deadline(), stageStatuses: blankStatuses() }, include: { photos: true } })))
}
export async function getVideos(req, res) { return res.json(await prisma.assessmentVideo.findMany({ orderBy: { stage: 'asc' } })) }
export async function updateVideos(req, res) {
  const videos = req.body?.videos
  if (!videos || typeof videos !== 'object') return res.status(400).json({ error: 'Informe os vídeos por etapa' })
  for (const stage of STAGES) { const youtubeUrl = typeof videos[stage] === 'string' ? videos[stage].trim().slice(0, 2000) : ''; if (youtubeUrl && !/^https:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(youtubeUrl)) return res.status(400).json({ error: `Link do YouTube inválido em ${stage}` }); await prisma.assessmentVideo.upsert({ where: { stage }, update: { youtubeUrl: youtubeUrl || null }, create: { stage, youtubeUrl: youtubeUrl || null } }) }
  return getVideos(req, res)
}
