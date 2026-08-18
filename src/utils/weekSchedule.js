const SAO_PAULO_OFFSET_MS = -3 * 60 * 60 * 1000

function toSaoPauloClock(date) {
  return new Date(date.getTime() + SAO_PAULO_OFFSET_MS)
}

function fromSaoPauloClock(date) {
  return new Date(date.getTime() - SAO_PAULO_OFFSET_MS)
}

export function getProgramFirstMonday(reference = new Date()) {
  const local = toSaoPauloClock(reference)
  const weekday = local.getUTCDay()
  const daysSinceMonday = (weekday + 6) % 7

  local.setUTCDate(local.getUTCDate() - daysSinceMonday)
  local.setUTCHours(0, 0, 0, 0)

  // Aprovações no sábado/domingo iniciam na segunda seguinte.
  if (weekday === 0 || weekday === 6) {
    local.setUTCDate(local.getUTCDate() + 7)
  }

  return fromSaoPauloClock(local)
}

export function getWeekSchedule(firstMonday, weekNumber) {
  const startDate = new Date(firstMonday)
  startDate.setUTCDate(startDate.getUTCDate() + (weekNumber - 1) * 7)

  // Segunda 00:00 até sexta 23:59:59 no horário de São Paulo.
  const endDate = new Date(startDate)
  endDate.setUTCDate(endDate.getUTCDate() + 5)
  endDate.setUTCHours(2, 59, 59, 999)

  return { startDate, endDate }
}

export function getISOWeekInfo(date) {
  const local = toSaoPauloClock(date)
  const target = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()))
  const dayNumber = target.getUTCDay() || 7

  target.setUTCDate(target.getUTCDate() + 4 - dayNumber)
  const isoYear = target.getUTCFullYear()
  const yearStart = new Date(Date.UTC(isoYear, 0, 1))
  const isoWeek = Math.ceil((((target - yearStart) / 86400000) + 1) / 7)

  return { calendarWeek: isoWeek, calendarYear: isoYear }
}

export async function normalizeStudentWeekSchedule(prisma, studentId) {
  const weeks = await prisma.weeklyTracking.findMany({
    where: { studentId },
    select: { id: true, weekNumber: true, startDate: true, endDate: true },
    orderBy: { weekNumber: 'asc' }
  })

  if (weeks.length === 0) return

  const firstMonday = getProgramFirstMonday(weeks[0].startDate)
  const needsNormalization = weeks.some((week) => {
    const expected = getWeekSchedule(firstMonday, week.weekNumber)
    return week.startDate.getTime() !== expected.startDate.getTime() || week.endDate.getTime() !== expected.endDate.getTime()
  })

  if (!needsNormalization) return

  for (const week of weeks) {
    const { startDate, endDate } = getWeekSchedule(firstMonday, week.weekNumber)
    await prisma.weeklyTracking.update({
      where: { id: week.id },
      data: { startDate, endDate }
    })
  }
}

export async function syncAutomaticWeekReleases(prisma, studentId, now = new Date()) {
  // Ajusta alunos antigos sem apagar exercícios, observações ou conclusão.
  await normalizeStudentWeekSchedule(prisma, studentId)

  await prisma.weeklyTracking.updateMany({
    where: {
      studentId,
      isReleased: false,
      startDate: { lte: now }
    },
    data: { isReleased: true }
  })
}

export function serializeWeekCalendar(week) {
  return {
    ...week,
    ...getISOWeekInfo(week.startDate)
  }
}
