import { STRENGTH_EXERCISES, numericValue, estimateOneRm, loadOptions, repetitionOptions, bodyWeightOptions } from './strengthResultsService.js'

export class AssessmentError extends Error {
  constructor(message, status = 400) { super(message); this.status = status }
}
const has = (object, key) => Object.hasOwn(object, key)
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const priorRecord = (value) => record(value) ? value : {}
function requireRecord(value) {
  if (!record(value)) throw new AssessmentError('data deve ser um objeto')
}
function number(value, options, field) {
  if (value === null || value === undefined || (typeof value === 'string' && !value.trim())) return null
  const result = numericValue(value, options)
  if (result === null) throw new AssessmentError(`Valor inválido em ${field}`)
  return result
}
function text(value, max, field) {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string') throw new AssessmentError(`Texto inválido em ${field}`)
  return value.trim().slice(0, max) || null
}
function patchNumbers(previous, input, fields) {
  const result = { ...priorRecord(previous) }
  for (const [key, options] of Object.entries(fields)) {
    if (has(input, key)) result[key] = number(input[key], options, key)
  }
  return result
}
export function validateStageRequest(body) {
  requireRecord(body)
  requireRecord(body.data)
  for (const key of ['complete', 'healthConsent']) {
    if (has(body, key) && typeof body[key] !== 'boolean') throw new AssessmentError(`${key} deve ser booleano`)
  }
}
export function patchBody(previous, input, complete = false) {
  requireRecord(input)
  const fields = Object.fromEntries(['heightCm', 'waistCm', 'hipCm', 'rightArmCm', 'leftArmCm', 'rightThighCm', 'leftThighCm'].map((key) => [key, { max: 500 }]))
  const result = patchNumbers(previous, input, { ...fields, weightKg: bodyWeightOptions })
  if (complete && numericValue(result.weightKg, bodyWeightOptions) === null) throw new AssessmentError('Informe um peso corporal positivo para concluir a etapa corporal')
  return result
}
export function validateStrengthCompletion(strength) {
  for (const key of STRENGTH_EXERCISES) {
    const item = strength?.[key]
    if (item?.notPerformed === true) {
      if (typeof item.notPerformedReason !== 'string' || !item.notPerformedReason.trim()) throw new AssessmentError(`Informe por que ${key} não foi realizado`)
    } else if (estimateOneRm(item?.loadKg, item?.repetitions) === null) {
      throw new AssessmentError(`Preencha carga positiva e repetições inteiras de ${key}, ou informe que não foi realizado e o motivo`)
    }
  }
}
export function patchStrength(previous, input, complete = false) {
  requireRecord(input)
  const result = patchNumbers(previous, input, { pushUps: { max: 10000, integer: true }, plankSeconds: { max: 86400 }, abdominalReps: { max: 10000, integer: true } })
  for (const key of STRENGTH_EXERCISES) {
    if (!has(input, key)) continue
    requireRecord(input[key])
    const patch = input[key]
    const item = { ...priorRecord(result[key]) }
    if (has(patch, 'notPerformed')) {
      if (typeof patch.notPerformed !== 'boolean') throw new AssessmentError(`notPerformed deve ser booleano em ${key}`)
      item.notPerformed = patch.notPerformed
    }
    if (has(patch, 'notPerformedReason')) item.notPerformedReason = text(patch.notPerformedReason, 1500, `${key}.notPerformedReason`)
    if (has(patch, 'loadKg')) item.loadKg = number(patch.loadKg, loadOptions, `${key}.loadKg`)
    if (has(patch, 'repetitions')) item.repetitions = number(patch.repetitions, repetitionOptions, `${key}.repetitions`)
    if (item.notPerformed === true) {
      if ((has(patch, 'loadKg') && item.loadKg !== null) || (has(patch, 'repetitions') && item.repetitions !== null)) throw new AssessmentError(`Não envie carga ou repetições para ${key} não realizado`)
      item.loadKg = null
      item.repetitions = null
    } else {
      item.notPerformedReason = null
    }
    // Legacy field retained for PR #10; authoritative reads always recompute.
    const estimate = estimateOneRm(item.loadKg, item.repetitions)
    item.estimatedOneRm = estimate === null ? null : Number(estimate.toFixed(2))
    result[key] = item
  }
  if (complete) validateStrengthCompletion(result)
  return result
}
export function patchAnamnesis(previous, input) {
  requireRecord(input)
  const textFields = ['motivationAndInstagram', 'personalTrainerExperience', 'routine', 'trainingDifficulties', 'sleepQuality', 'nutrition', 'smokingAndAlcohol', 'healthAndMedication', 'currentSymptoms', 'injuryHistory', 'surgeryHistory', 'allergies', 'currentPain', 'effortDiscomfort', 'goals', 'bodyPerception', 'currentExercises', 'cardio', 'trainingLocation', 'muscleEmphasis', 'effortPreference', 'exercisePreferences', 'methodPreferences', 'relevantNotes', 'routineChanges', 'wellbeingChanges', 'workoutFeedback', 'currentBodyPerception']
  const result = patchNumbers(previous, input, { fatigueLevel: { max: 10 }, sleepHours: { max: 24 }, waterLiters: { max: 20 }, weeklyFrequency: { max: 14, integer: true }, trainingMinutes: { max: 600 }, trainingDedicationScore: { max: 10 }, nutritionHydrationScore: { max: 10 } })
  for (const key of textFields) if (has(input, key)) result[key] = text(input[key], 3500, key)
  return result
}
export function patchEndurance(previous, input) {
  requireRecord(input)
  const result = patchNumbers(previous, input, { distanceMeters: { max: 100000 } })
  if (has(input, 'modality')) {
    if (!['TREADMILL_5MIN', 'WALKING_6MIN'].includes(input.modality)) throw new AssessmentError('Modalidade inválida')
    result.modality = input.modality
  }
  result.modality ||= 'TREADMILL_5MIN'
  const distance = numericValue(result.distanceMeters)
  result.vamKmh = distance !== null && result.modality === 'TREADMILL_5MIN' ? Number((distance / 83.33).toFixed(2)) : null
  result.vo2Max = distance === null ? null : Number((result.modality === 'WALKING_6MIN' ? 4.948 + 0.023 * distance : result.vamKmh * 3.5).toFixed(2))
  return result
}
