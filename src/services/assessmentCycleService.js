import { milestonePoints } from '../utils/programPoints.js'
import { AssessmentError, patchBody, patchStrength, patchAnamnesis, patchEndurance, validateStageRequest, validateStrengthCompletion } from './assessmentValidationService.js'
import { numericValue, bodyWeightOptions } from './strengthResultsService.js'

export const STAGES = ['ANAMNESIS', 'BODY', 'POSTURAL', 'STRENGTH', 'ENDURANCE']
export const blankStatuses = () => Object.fromEntries(STAGES.map((stage) => [stage, 'PENDING']))

export function assertEditable(cycle) {
  if (new Date(cycle.deadlineAt) < new Date() || cycle.status === 'COMPLETED') throw new AssessmentError('O ciclo não aceita mais alterações', 409)
}

export function stageUpdate(cycle, stage, body) {
  validateStageRequest(body)
  const complete = body.complete === true
  const data = { stageStatuses: { ...blankStatuses(), ...cycle.stageStatuses, [stage]: complete ? 'COMPLETED' : 'IN_PROGRESS' } }
  if (stage === 'BODY') data.bodyAssessment = patchBody(cycle.bodyAssessment, body.data, complete)
  else if (stage === 'STRENGTH') data.strengthTest = patchStrength(cycle.strengthTest, body.data, complete)
  else if (stage === 'ENDURANCE') data.enduranceTest = patchEndurance(cycle.enduranceTest, body.data)
  else if (stage === 'ANAMNESIS') {
    data.anamnesis = patchAnamnesis(cycle.anamnesis, body.data)
    if (body.healthConsent === true && !cycle.healthConsentAt) data.healthConsentAt = new Date()
    if (complete && !data.healthConsentAt && !cycle.healthConsentAt) throw new AssessmentError('Confirme o tratamento dos dados sensíveis para concluir')
  } else throw new AssessmentError('Etapa inválida')
  return data
}

// Called inside a transaction after locking this cycle. Shared by stage and photo writes.
export async function persistCycleUpdate(tx, cycle, data) {
  const merged = { ...cycle, ...data }
  if (STAGES.every((stage) => merged.stageStatuses?.[stage] === 'COMPLETED')) {
    validateStrengthCompletion(merged.strengthTest)
    if (numericValue(merged.bodyAssessment?.weightKg, bodyWeightOptions) === null) throw new AssessmentError('Informe um peso corporal positivo para concluir o ciclo')
    if (!merged.healthConsentAt) throw new AssessmentError('Confirme o tratamento dos dados sensíveis para concluir')
    Object.assign(data, { status: 'COMPLETED', completedAt: new Date() })
  }
  await tx.assessmentCycle.update({ where: { id: cycle.id }, data })
  if (data.status === 'COMPLETED' && cycle.sequence > 0 && !cycle.pointsAwarded) {
    const student = await tx.student.findUnique({ where: { id: cycle.studentId }, select: { packageType: true } })
    const points = milestonePoints(student?.packageType)
    const award = await tx.assessmentCycle.updateMany({ where: { id: cycle.id, pointsAwarded: false }, data: { pointsAwarded: true } })
    if (award.count) await tx.studentRanking.upsert({ where: { studentId: cycle.studentId }, create: { studentId: cycle.studentId, totalPoints: points }, update: { totalPoints: { increment: points } } })
  }
  return tx.assessmentCycle.findUnique({ where: { id: cycle.id }, include: { photos: true } })
}

export async function lockCycle(tx, cycleId) {
  // Serialize read/merge/write so concurrent saves of different JSON fields cannot erase each other.
  await tx.$queryRaw`SELECT "id" FROM "AssessmentCycle" WHERE "id" = ${cycleId} FOR UPDATE`
  const cycle = await tx.assessmentCycle.findUnique({ where: { id: cycleId }, include: { photos: true } })
  if (!cycle) throw new AssessmentError('Avaliação não encontrada', 404)
  assertEditable(cycle)
  return cycle
}
