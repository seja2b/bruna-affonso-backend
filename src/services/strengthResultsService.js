export const STRENGTH_EXERCISES = ['smithSquat', 'closeGripPulldown', 'seatedDumbbellPress', 'deadlift']
export const STRENGTH_RULES_VERSION = 'epley-strength-v1'

// Numeric form strings remain supported. Never coerce booleans, arrays or blanks to zero.
export function numericValue(value, { min = 0, max = 100000, positive = false, integer = false } = {}) {
  if (typeof value !== 'number' && typeof value !== 'string') return null
  if (typeof value === 'string' && !value.trim()) return null
  const number = Number(value)
  return Number.isFinite(number) && number >= min && number <= max &&
    (!positive || number > 0) && (!integer || Number.isInteger(number)) ? number : null
}

export const loadOptions = { max: 1000, positive: true }
export const repetitionOptions = { min: 1, max: 100, integer: true }
export const bodyWeightOptions = { max: 500, positive: true }

export function estimateOneRm(loadKg, repetitions) {
  const load = numericValue(loadKg, loadOptions)
  const reps = numericValue(repetitions, repetitionOptions)
  return load === null || reps === null ? null : load * (1 + reps / 30)
}

export function classifyStrength(exercise, relativeStrength) {
  if (!['smithSquat', 'deadlift'].includes(exercise)) return { classification: null, classificationReason: 'NOT_APPLICABLE' }
  if (!Number.isFinite(relativeStrength) || relativeStrength <= 0) return { classification: null, classificationReason: 'INSUFFICIENT_DATA' }
  let classification = null
  let classificationReason = 'BELOW_DEFINED_RANGE'
  if (exercise === 'smithSquat') {
    if (relativeStrength >= 1.25) classification = 'Excelente'
    else if (relativeStrength > 1.20) classificationReason = 'UNDEFINED_RANGE'
    else if (relativeStrength >= 1) classification = 'Bom'
    else if (relativeStrength >= 0.75) classification = 'Fraco'
  } else {
    if (relativeStrength >= 1.5) classification = 'Excelente'
    else if (relativeStrength >= 1.25) classification = 'Bom'
    else if (relativeStrength >= 1) classification = 'Fraco'
  }
  return { classification, classificationReason: classification ? null : classificationReason }
}

export function strengthResults(cycle) {
  const bodyWeightKg = numericValue(cycle?.bodyAssessment?.weightKg, bodyWeightOptions)
  const exercises = Object.fromEntries(STRENGTH_EXERCISES.map((exercise) => {
    const input = cycle?.strengthTest?.[exercise]
    const notPerformed = input?.notPerformed === true
    const loadKg = notPerformed ? null : numericValue(input?.loadKg, loadOptions)
    const repetitions = notPerformed ? null : numericValue(input?.repetitions, repetitionOptions)
    const estimatedOneRm = notPerformed ? null : estimateOneRm(loadKg, repetitions)
    const applicable = ['smithSquat', 'deadlift'].includes(exercise)
    const relative = applicable && estimatedOneRm !== null && bodyWeightKg !== null ? estimatedOneRm / bodyWeightKg : null
    const relativeStrength = Number.isFinite(relative) ? relative : null
    let classification = classifyStrength(exercise, relativeStrength)
    const resultReason = notPerformed ? 'NOT_PERFORMED' : estimatedOneRm === null ? 'MISSING_OR_INVALID_INPUT' : null
    if (applicable && (resultReason || bodyWeightKg === null)) {
      classification = { classification: null, classificationReason: resultReason || 'MISSING_OR_INVALID_BODY_WEIGHT' }
    } else if (relative !== null && !Number.isFinite(relative)) {
      classification = { classification: null, classificationReason: 'NON_FINITE_RESULT' }
    }
    return [exercise, {
      loadKg, repetitions, estimatedOneRm, bodyWeightKg, relativeStrength,
      relativeStrengthApplicable: applicable, classificationApplicable: applicable,
      ...classification, resultReason, notPerformed,
      notPerformedReason: notPerformed && typeof input.notPerformedReason === 'string' ? input.notPerformedReason : null
    }]
  }))
  return { rulesVersion: STRENGTH_RULES_VERSION, formula: 'EPLEY', exercises }
}

export function previousCycle(cycles, current) {
  return cycles.filter((item) => item.studentId === current.studentId && item.sequence < current.sequence)
    .sort((a, b) => b.sequence - a.sequence)[0] || null
}

export function strengthComparison(current, reference) {
  if (!reference || reference.studentId !== current.studentId || reference.sequence >= current.sequence) return null
  const before = strengthResults(reference).exercises
  const after = strengthResults(current).exercises
  return {
    rulesVersion: STRENGTH_RULES_VERSION,
    referenceCycleId: reference.id, referenceSequence: reference.sequence,
    currentCycleId: current.id, currentSequence: current.sequence,
    exercises: Object.fromEntries(STRENGTH_EXERCISES.map((key) => {
      const previous = before[key]
      const next = after[key]
      const differenceKg = previous.estimatedOneRm !== null && next.estimatedOneRm !== null ? next.estimatedOneRm - previous.estimatedOneRm : null
      return [key, { previous, current: next, differenceKg,
        evolutionPercent: differenceKg !== null && previous.estimatedOneRm > 0 ? differenceKg / previous.estimatedOneRm * 100 : null,
        comparisonReason: differenceKg === null ? 'INSUFFICIENT_DATA' : null }]
    }))
  }
}
