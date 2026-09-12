import test from 'node:test'
import assert from 'node:assert/strict'
import { patchBody, patchStrength, patchEndurance, patchAnamnesis, validateStageRequest } from '../src/services/assessmentValidationService.js'
import { stageUpdate, blankStatuses, assertEditable } from '../src/services/assessmentCycleService.js'
import { STRENGTH_EXERCISES } from '../src/services/strengthResultsService.js'

const fullStrength = () => Object.fromEntries(STRENGTH_EXERCISES.map((key) => [key, { loadKg: 50, repetitions: 10 }]))

test('explicit blanks are null, omitted fields are preserved and invalid types rejected', () => {
  for (const value of [null, '', '   ']) assert.equal(patchBody({ weightKg: 60 }, { weightKg: value }).weightKg, null)
  assert.deepEqual(patchBody({ weightKg: 60, waistCm: 80 }, { waistCm: '82' }), { weightKg: 60, waistCm: 82 })
  for (const value of [0, -1, 501, true, false, [], {}, 'bad', Infinity]) assert.throws(() => patchBody({}, { weightKg: value }), /inválido/)
  for (const value of [null, [], 'bad', true]) assert.throws(() => patchBody({}, value))
  for (const value of [null, [], 'bad', true]) assert.throws(() => validateStageRequest({ data: value }))
  assert.throws(() => validateStageRequest({ data: {}, complete: 'true' }))
  assert.throws(() => validateStageRequest({ data: {}, healthConsent: 1 }))
})

test('drafts permit incomplete data; completion requires weight or four exercises', () => {
  assert.doesNotThrow(() => patchBody({}, { weightKg: null }))
  assert.throws(() => patchBody({}, { weightKg: null }, true), /peso corporal/)
  assert.equal(patchBody({}, { weightKg: '60.5' }, true).weightKg, 60.5)
  assert.doesNotThrow(() => patchStrength({}, { smithSquat: { loadKg: 50 } }))
  assert.throws(() => patchStrength({}, { smithSquat: { loadKg: 50 } }, true), /repetições/)
  assert.doesNotThrow(() => patchStrength({}, fullStrength(), true))
  for (const repetitions of [0, 101, 1.5, true, [], {}]) assert.throws(() => patchStrength({}, { deadlift: { repetitions } }))
})

test('explicit not performed requires a reason to conclude and clears stale measurements', () => {
  const inputs = fullStrength()
  inputs.deadlift = { notPerformed: true, notPerformedReason: 'Orientação profissional' }
  const result = patchStrength(fullStrength(), inputs, true)
  assert.equal(result.deadlift.loadKg, null)
  assert.equal(result.deadlift.repetitions, null)
  assert.equal(result.deadlift.estimatedOneRm, null)
  assert.throws(() => patchStrength({}, { ...inputs, deadlift: { notPerformed: true } }, true), /por que/)
  assert.throws(() => patchStrength({}, { deadlift: { notPerformed: 'true' } }))
  assert.throws(() => patchStrength({}, { deadlift: { notPerformed: true, loadKg: 50 } }))
  const performed = patchStrength(result, { deadlift: { notPerformed: false, loadKg: 50, repetitions: 10 } }, true)
  assert.equal(performed.deadlift.notPerformedReason, null)
  assert.ok(performed.deadlift.estimatedOneRm > 0)
})

test('nested partial patches keep other exercises, resistance, legacy fields and original inputs', () => {
  const previous = { ...fullStrength(), pushUps: 0, legacyField: 'keep' }
  const snapshot = structuredClone(previous)
  const updated = patchStrength(previous, { smithSquat: { loadKg: '60', estimatedOneRm: 99999, classification: 'Excelente' } })
  assert.equal(updated.smithSquat.repetitions, 10)
  assert.equal(updated.smithSquat.estimatedOneRm, 80)
  assert.equal(updated.smithSquat.classification, undefined)
  assert.deepEqual(updated.deadlift, previous.deadlift)
  assert.equal(updated.pushUps, 0)
  assert.equal(updated.legacyField, 'keep')
  assert.deepEqual(previous, snapshot)
})

test('other stages preserve omitted data and legacy resistance without coercing absence', () => {
  const cardio = patchEndurance({ pushUps: 10, modality: 'WALKING_6MIN', distanceMeters: 500 }, { distanceMeters: null })
  assert.equal(cardio.pushUps, 10)
  assert.equal(cardio.vo2Max, null)
  assert.equal(cardio.vamKmh, null)
  assert.equal(patchEndurance(cardio, { distanceMeters: 500 }).vo2Max, 16.45)
  assert.throws(() => patchEndurance({}, { modality: [] }))
  assert.deepEqual(patchAnamnesis({ routine: 'keep', waterLiters: 2 }, { sleepHours: '' }), { routine: 'keep', waterLiters: 2, sleepHours: null })
  assert.throws(() => patchAnamnesis({}, { routine: {} }))
})

test('stage updates do not write other stages and only mark the requested stage', () => {
  const cycle = { stageStatuses: { ...blankStatuses(), BODY: 'COMPLETED' }, strengthTest: fullStrength(), bodyAssessment: { weightKg: 60 } }
  const snapshot = structuredClone(cycle)
  const patch = stageUpdate(cycle, 'STRENGTH', { data: { smithSquat: { loadKg: 55 } }, complete: false })
  assert.equal(patch.stageStatuses.BODY, 'COMPLETED')
  assert.equal(patch.stageStatuses.STRENGTH, 'IN_PROGRESS')
  assert.equal(patch.bodyAssessment, undefined)
  assert.deepEqual(cycle, snapshot)
  assert.throws(() => stageUpdate(cycle, 'POSTURAL', { data: {} }))
  assert.throws(() => stageUpdate(cycle, 'ANAMNESIS', { data: {}, complete: true }), /tratamento/)
})

test('completed and expired cycles reject mutation', () => {
  assert.throws(() => assertEditable({ status: 'COMPLETED', deadlineAt: new Date(Date.now() + 100000) }), /alterações/)
  assert.throws(() => assertEditable({ status: 'IN_PROGRESS', deadlineAt: new Date(0) }), /alterações/)
})
