import { test, before, after, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtemp, writeFile, rm, access } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { once } from 'node:events'
import express from 'express'
import { PrismaClient } from '@prisma/client'
import { createAssessmentHandlers } from '../../src/controllers/assessmentController.js'
import { STAGES, blankStatuses } from '../../src/services/assessmentCycleService.js'
import { STRENGTH_EXERCISES } from '../../src/services/strengthResultsService.js'

// This suite never falls back to DATABASE_URL and only removes its own fixture users.
if (!process.env.TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL must point to an isolated PostgreSQL test database')
const prisma = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } })
const handlers = createAssessmentHandlers(prisma)
let server, baseUrl, student, otherStudent, uploadDir
const fullStrength = (loadKg = 30) => Object.fromEntries(STRENGTH_EXERCISES.map((key) => [key, { loadKg, repetitions: 30, estimatedOneRm: 99999 }]))
const completedStages = () => Object.fromEntries(STAGES.map((stage) => [stage, 'COMPLETED']))
const photoViews = ['FRONT', 'BACK', 'RIGHT', 'LEFT', 'FRONT_RELAXED', 'BACK_RELAXED', 'RIGHT_RELAXED', 'LEFT_RELAXED', 'FRONT_DETAIL', 'BACK_DETAIL', 'RIGHT_DETAIL', 'LEFT_DETAIL', 'FRONT_FOURTH', 'BACK_FOURTH', 'RIGHT_FOURTH', 'LEFT_FOURTH', 'FRONT_FIFTH', 'BACK_FIFTH', 'RIGHT_FIFTH', 'LEFT_FIFTH', 'POSTERIOR_RIGHT', 'POSTERIOR_LEFT', 'DEEP_SQUAT']

before(async () => {
  await prisma.$connect()
  uploadDir = await mkdtemp(path.join(os.tmpdir(), 'assessment-integration-'))
  const app = express()
  app.use(express.json())
  // Authentication is injected only in this test server; production routes retain their middleware.
  app.use((req, _res, next) => { req.user = { userId: student.userId, role: 'STUDENT' }; next() })
  const route = (handler) => (req, res, next) => Promise.resolve(handler(req, res)).catch(next)
  app.get('/assessments', route(handlers.getMyAssessments))
  app.patch('/assessments/:cycleId/stages/:stage', route(handlers.saveStage))
  app.get('/admin/students/:studentId/assessments', route(handlers.getAdminAssessments))
  app.post('/admin/students/:studentId/reassessments', route(handlers.releaseReassessment))
  app.post('/assessments/:cycleId/photos/:view', (req, _res, next) => {
    req.file = { filename: req.body.filename, originalname: 'fixture.jpg', mimetype: 'image/jpeg', size: 1, destination: uploadDir, path: path.join(uploadDir, req.body.filename) }
    next()
  }, route(handlers.uploadPhoto))
  app.use((error, _req, res, _next) => res.status(500).json({ error: error.message }))
  server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  baseUrl = `http://127.0.0.1:${server.address().port}`
})
beforeEach(async () => {
  const createStudent = () => prisma.student.create({ data: { user: { create: { email: `assessment-${randomUUID()}@example.test`, name: 'Integration fixture', password: 'not-a-login', status: 'APPROVED' } } } })
  student = await createStudent()
  otherStudent = await createStudent()
})
afterEach(async () => {
  for (const fixture of [student, otherStudent]) if (fixture) await prisma.user.delete({ where: { id: fixture.userId } })
})
after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve))
  await prisma.$disconnect()
  if (uploadDir) await rm(uploadDir, { recursive: true, force: true })
})
async function request(url, method = 'GET', body) {
  const response = await fetch(baseUrl + url, { method, headers: { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  return { status: response.status, data: await response.json() }
}
function createCycle(data = {}) {
  return prisma.assessmentCycle.create({ data: { studentId: student.id, deadlineAt: new Date(Date.now() + 86400000), stageStatuses: blankStatuses(), ...data } })
}
async function seedPhotos(cycleId, count = 23) {
  await prisma.assessmentPhoto.createMany({ data: photoViews.slice(0, count).map((view) => ({ cycleId, view, storageKey: randomUUID(), originalName: 'fixture.jpg', mimeType: 'image/jpeg', size: 1 })) })
}
async function upload(cycle, view = 'DEEP_SQUAT') {
  const filename = `${randomUUID()}.jpg`
  await writeFile(path.join(uploadDir, filename), 'x')
  return { filename, ...await request(`/assessments/${cycle.id}/photos/${view}`, 'POST', { filename }) }
}

test('student and admin GET return identical authoritative results without changing history', async () => {
  const initial = await createCycle({ status: 'COMPLETED', strengthTest: fullStrength(), bodyAssessment: { weightKg: null } })
  await createCycle({ type: 'REASSESSMENT', sequence: 1, strengthTest: fullStrength(45), bodyAssessment: { weightKg: 60 } })
  const studentResponse = await request('/assessments')
  const adminResponse = await request(`/admin/students/${student.id}/assessments`)
  assert.equal(studentResponse.status, 200)
  assert.equal(adminResponse.status, 200)
  assert.deepEqual(studentResponse.data.cycles, adminResponse.data.cycles)
  const result = studentResponse.data.cycles[1].strengthComparison.exercises.smithSquat
  assert.equal(result.previous.estimatedOneRm, 60)
  assert.equal(result.previous.bodyWeightKg, null)
  assert.equal(result.previous.relativeStrength, null)
  assert.equal(result.current.relativeStrength, 1.5)
  assert.equal(result.differenceKg, 30)
  assert.equal(result.evolutionPercent, 50)
  const unchanged = await prisma.assessmentCycle.findUnique({ where: { id: initial.id } })
  assert.deepEqual(unchanged, initial)
})

test('PATCH preserves nested fields and other stages, ignores forged derived fields', async () => {
  const cycle = await createCycle({ strengthTest: fullStrength(), bodyAssessment: { weightKg: 50, waistCm: 80 }, anamnesis: { routine: 'Keep me' } })
  const response = await request(`/assessments/${cycle.id}/stages/STRENGTH`, 'PATCH', { data: { smithSquat: { loadKg: '40', estimatedOneRm: 99999, classification: 'Excelente' } }, complete: false })
  assert.equal(response.status, 200)
  assert.equal(response.data.strengthResults.exercises.smithSquat.estimatedOneRm, 80)
  assert.equal(response.data.strengthTest.smithSquat.repetitions, 30)
  assert.equal(response.data.strengthTest.smithSquat.estimatedOneRm, 80)
  assert.deepEqual(response.data.strengthTest.deadlift, cycle.strengthTest.deadlift)
  assert.deepEqual(response.data.bodyAssessment, cycle.bodyAssessment)
  assert.deepEqual(response.data.anamnesis, cycle.anamnesis)
  const body = await request(`/assessments/${cycle.id}/stages/BODY`, 'PATCH', { data: { weightKg: 100 }, complete: true })
  assert.equal(body.data.strengthResults.exercises.smithSquat.relativeStrength, 0.8)
  assert.equal(body.data.bodyAssessment.waistCm, 80)
  assert.equal(body.data.strengthTest.smithSquat.estimatedOneRm, 80)
})

test('concurrent partial writes preserve both updates using the database cycle lock', async () => {
  const cycle = await createCycle({ strengthTest: fullStrength(), bodyAssessment: { weightKg: 50 } })
  const responses = await Promise.all([
    request(`/assessments/${cycle.id}/stages/STRENGTH`, 'PATCH', { data: { smithSquat: { loadKg: 40 } } }),
    request(`/assessments/${cycle.id}/stages/STRENGTH`, 'PATCH', { data: { deadlift: { loadKg: 45 } } }),
    request(`/assessments/${cycle.id}/stages/BODY`, 'PATCH', { data: { weightKg: 60 } })
  ])
  assert.ok(responses.every((response) => response.status === 200))
  const updated = await prisma.assessmentCycle.findUnique({ where: { id: cycle.id } })
  assert.equal(updated.strengthTest.smithSquat.loadKg, 40)
  assert.equal(updated.strengthTest.deadlift.loadKg, 45)
  assert.equal(updated.bodyAssessment.weightKg, 60)
  assert.equal(updated.stageStatuses.BODY, 'IN_PROGRESS')
  assert.equal(updated.stageStatuses.STRENGTH, 'IN_PROGRESS')
})

test('invalid payloads and invalid completion return 400 without writing', async () => {
  const cycle = await createCycle()
  for (const [stage, body] of [
    ['BODY', { data: { weightKg: true } }], ['BODY', { data: { weightKg: 0 } }],
    ['BODY', { data: { weightKg: null }, complete: true }], ['STRENGTH', { data: {}, complete: true }],
    ['STRENGTH', { data: { deadlift: { repetitions: 1.5 } } }], ['STRENGTH', { data: [] }],
    ['STRENGTH', { data: {}, complete: 'true' }]
  ]) {
    const response = await request(`/assessments/${cycle.id}/stages/${stage}`, 'PATCH', body)
    assert.equal(response.status, 400)
    assert.deepEqual(await prisma.assessmentCycle.findUnique({ where: { id: cycle.id } }), cycle)
  }
  const draft = await request(`/assessments/${cycle.id}/stages/STRENGTH`, 'PATCH', { data: { deadlift: { loadKg: '', repetitions: null } } })
  assert.equal(draft.status, 200)
  assert.equal(draft.data.strengthTest.deadlift.loadKg, null)
  assert.equal(draft.data.strengthTest.deadlift.repetitions, null)
})

test('last regular stage finalizes an initial cycle without awarding reassessment points', async () => {
  const cycle = await createCycle({ stageStatuses: { ...completedStages(), STRENGTH: 'PENDING' }, bodyAssessment: { weightKg: 60 }, healthConsentAt: new Date() })
  await seedPhotos(cycle.id)
  const input = fullStrength()
  input.deadlift = { notPerformed: true, notPerformedReason: 'Orientação profissional' }
  const response = await request(`/assessments/${cycle.id}/stages/STRENGTH`, 'PATCH', { data: input, complete: true })
  assert.equal(response.status, 200)
  assert.equal(response.data.status, 'COMPLETED')
  assert.ok(response.data.completedAt)
  assert.equal(response.data.strengthResults.exercises.deadlift.resultReason, 'NOT_PERFORMED')
  assert.equal(await prisma.studentRanking.findUnique({ where: { studentId: student.id } }), null)
})

test('last photo finalizes reassessment, awards once and permits the next cycle', async () => {
  await createCycle({ status: 'COMPLETED' })
  const cycle = await createCycle({ type: 'REASSESSMENT', sequence: 1, stageStatuses: { ...completedStages(), POSTURAL: 'IN_PROGRESS' }, strengthTest: fullStrength(), bodyAssessment: { weightKg: 60 }, healthConsentAt: new Date() })
  await seedPhotos(cycle.id, 22)
  assert.equal((await upload(cycle)).status, 201)
  const updated = await prisma.assessmentCycle.findUnique({ where: { id: cycle.id } })
  assert.equal(updated.status, 'COMPLETED')
  assert.ok(updated.completedAt)
  assert.equal(updated.pointsAwarded, true)
  assert.equal((await prisma.studentRanking.findUnique({ where: { studentId: student.id } })).totalPoints, 100)
  const retry = await upload(cycle)
  assert.equal(retry.status, 409)
  await assert.rejects(access(path.join(uploadDir, retry.filename)))
  assert.equal((await prisma.studentRanking.findUnique({ where: { studentId: student.id } })).totalPoints, 100)
  const release = await request(`/admin/students/${student.id}/reassessments`, 'POST', {})
  assert.equal(release.status, 201)
  assert.equal(release.data.sequence, 2)
  assert.equal(release.data.strengthComparison.referenceCycleId, cycle.id)
})

test('concurrent last stage and last photo finalize with one points award', async () => {
  const cycle = await createCycle({ type: 'REASSESSMENT', sequence: 1, stageStatuses: { ...completedStages(), POSTURAL: 'IN_PROGRESS', STRENGTH: 'IN_PROGRESS' }, strengthTest: fullStrength(), bodyAssessment: { weightKg: 60 }, healthConsentAt: new Date() })
  await seedPhotos(cycle.id, 22)
  const [photo, stage] = await Promise.all([upload(cycle), request(`/assessments/${cycle.id}/stages/STRENGTH`, 'PATCH', { data: {}, complete: true })])
  assert.equal(photo.status, 201)
  assert.equal(stage.status, 200)
  assert.equal((await prisma.assessmentCycle.findUnique({ where: { id: cycle.id } })).status, 'COMPLETED')
  assert.equal((await prisma.studentRanking.findUnique({ where: { studentId: student.id } })).totalPoints, 100)
})

test('last photo rolls back if legacy completed stages lack required source data', async () => {
  const cycle = await createCycle({ stageStatuses: { ...completedStages(), POSTURAL: 'IN_PROGRESS' }, strengthTest: fullStrength(), healthConsentAt: new Date() })
  await seedPhotos(cycle.id, 22)
  const response = await upload(cycle)
  assert.equal(response.status, 400)
  assert.equal(await prisma.assessmentPhoto.count({ where: { cycleId: cycle.id } }), 22)
  assert.deepEqual(await prisma.assessmentCycle.findUnique({ where: { id: cycle.id } }), cycle)
  await assert.rejects(access(path.join(uploadDir, response.filename)))
})

test('ownership and deadline checks prevent mutation', async () => {
  const foreign = await createCycle({ studentId: otherStudent.id })
  assert.equal((await request(`/assessments/${foreign.id}/stages/BODY`, 'PATCH', { data: { weightKg: 50 } })).status, 404)
  const expired = await createCycle({ deadlineAt: new Date(0) })
  assert.equal((await request(`/assessments/${expired.id}/stages/BODY`, 'PATCH', { data: { weightKg: 50 } })).status, 409)
})
