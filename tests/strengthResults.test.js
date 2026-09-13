import test from 'node:test'
import assert from 'node:assert/strict'
import { STRENGTH_EXERCISES, estimateOneRm, classifyStrength, strengthResults, strengthComparison, previousCycle } from '../src/services/strengthResultsService.js'

function cycle(id, sequence, weight, load = 30) {
  return { id, studentId: 'student', sequence, bodyAssessment: { weightKg: weight },
    strengthTest: Object.fromEntries(STRENGTH_EXERCISES.map((key) => [key, { loadKg: load, repetitions: 30 }])) }
}

test('Epley uses the prescribed formula, including one repetition and decimal loads', () => {
  assert.equal(estimateOneRm(50, 10), 50 * (1 + 10 / 30))
  assert.equal(estimateOneRm('50.5', '1'), 50.5 * (1 + 1 / 30))
  assert.equal(estimateOneRm(30, 30), 60)
})

for (const [exercise, cases] of Object.entries({
  smithSquat: [[0.7499, null, 'BELOW_DEFINED_RANGE'], [0.75, 'Fraco'], [0.9999, 'Fraco'], [1, 'Bom'], [1.2, 'Bom'], [1.2000001, null, 'UNDEFINED_RANGE'], [1.225, null, 'UNDEFINED_RANGE'], [1.249999, null, 'UNDEFINED_RANGE'], [1.25, 'Excelente'], [1.5, 'Excelente']],
  deadlift: [[0.9999, null, 'BELOW_DEFINED_RANGE'], [1, 'Fraco'], [1.2, 'Fraco'], [1.249999, 'Fraco'], [1.25, 'Bom'], [1.49999, 'Bom'], [1.5, 'Excelente']]
})) {
  for (const [relative, classification, reason = null] of cases) test(`${exercise}: ${relative}x`, () => {
    assert.deepEqual(classifyStrength(exercise, relative), { classification, classificationReason: reason })
    const result = strengthResults(cycle('a', 0, 100, relative * 50)).exercises[exercise]
    assert.equal(result.classification, classification)
  })
}

test('invalid and absent source values never become zero, infinity or a forged estimate', () => {
  for (const value of [undefined, null, '', '  ', true, false, [], {}, NaN, Infinity, -1, 0, 'abc', 1001]) assert.equal(estimateOneRm(value, 10), null)
  for (const value of [undefined, null, '', true, [], {}, NaN, Infinity, 0, -1, 1.5, 101]) assert.equal(estimateOneRm(50, value), null)
  const input = cycle('a', 0, null)
  input.strengthTest.smithSquat = { estimatedOneRm: 9999, classification: 'Excelente' }
  const result = strengthResults(input).exercises.smithSquat
  assert.equal(result.estimatedOneRm, null)
  assert.equal(result.classification, null)
  assert.equal(result.resultReason, 'MISSING_OR_INVALID_INPUT')
})

test('puxador and desenvolvimento have 1RM but no relative strength or classification', () => {
  const result = strengthResults(cycle('a', 0, 50)).exercises
  for (const key of ['closeGripPulldown', 'seatedDumbbellPress']) {
    assert.equal(result[key].estimatedOneRm, 60)
    assert.equal(result[key].bodyWeightKg, 50)
    assert.equal(result[key].relativeStrength, null)
    assert.equal(result[key].classification, null)
    assert.equal(result[key].classificationReason, 'NOT_APPLICABLE')
  }
})

test('classification uses the unrounded estimate, never a stored rounded result', () => {
  const input = cycle('a', 0, 100, 60.00001)
  input.strengthTest.smithSquat.estimatedOneRm = 120
  assert.equal(strengthResults(input).exercises.smithSquat.classificationReason, 'UNDEFINED_RANGE')
})

test('comparison uses each cycle weight and the immediately preceding sequence', () => {
  const initial = cycle('initial', 0, 60, 30)
  const previous = cycle('previous', 1, 50, 30)
  const current = cycle('current', 2, 60, 45)
  assert.equal(previousCycle([current, initial, previous], current), previous)
  const result = strengthComparison(current, previous)
  assert.equal(result.referenceCycleId, previous.id)
  assert.equal(result.currentCycleId, current.id)
  assert.deepEqual([result.exercises.smithSquat.previous.estimatedOneRm, result.exercises.smithSquat.current.estimatedOneRm, result.exercises.smithSquat.differenceKg, result.exercises.smithSquat.evolutionPercent], [60, 90, 30, 50])
  assert.equal(result.exercises.smithSquat.previous.relativeStrength, 1.2)
  assert.equal(result.exercises.smithSquat.current.relativeStrength, 1.5)
  assert.equal(result.exercises.smithSquat.previous.classification, 'Bom')
  assert.equal(result.exercises.smithSquat.current.classification, 'Excelente')
  assert.equal(strengthComparison(current, initial).referenceCycleId, initial.id)
  assert.equal(strengthComparison(initial, null), null)
  assert.equal(strengthComparison(initial, current), null)
  assert.equal(strengthComparison(current, { ...previous, studentId: 'other' }), null)
})

test('incomplete history is read without writes or borrowing weight from another cycle', () => {
  const old = cycle('old', 0, null)
  const current = cycle('new', 1, 50)
  const snapshot = structuredClone(old)
  const result = strengthComparison(current, old).exercises.deadlift
  assert.equal(result.previous.estimatedOneRm, 60)
  assert.equal(result.previous.relativeStrength, null)
  assert.equal(result.previous.bodyWeightKg, null)
  assert.equal(result.previous.classificationReason, 'MISSING_OR_INVALID_BODY_WEIGHT')
  assert.equal(result.differenceKg, 0)
  assert.deepEqual(old, snapshot)
  old.strengthTest = null
  const incomplete = strengthComparison(current, old).exercises.deadlift
  assert.equal(incomplete.differenceKg, null)
  assert.equal(incomplete.evolutionPercent, null)
  assert.equal(incomplete.comparisonReason, 'INSUFFICIENT_DATA')
  assert.doesNotThrow(() => strengthResults({ strengthTest: { smithSquat: [] }, bodyAssessment: [] }))
})

test('explicitly not performed has no estimate even with conflicting historical input', () => {
  const input = cycle('a', 0, 50)
  input.strengthTest.smithSquat = { notPerformed: true, notPerformedReason: 'Dor', loadKg: 100, repetitions: 10 }
  const result = strengthResults(input).exercises.smithSquat
  assert.equal(result.estimatedOneRm, null)
  assert.equal(result.relativeStrength, null)
  assert.equal(result.classificationReason, 'NOT_PERFORMED')
  assert.equal(result.notPerformedReason, 'Dor')
})

test('non-finite relative strength is unavailable and declining 1RM keeps its negative delta', () => {
  const extreme = strengthResults(cycle('a', 0, Number.MIN_VALUE)).exercises.smithSquat
  assert.equal(extreme.relativeStrength, null)
  assert.equal(extreme.classificationReason, 'NON_FINITE_RESULT')
  const comparison = strengthComparison(cycle('b', 1, 60, 15), cycle('a', 0, 60, 30)).exercises.deadlift
  assert.equal(comparison.differenceKg, -30)
  assert.equal(comparison.evolutionPercent, -50)
})
