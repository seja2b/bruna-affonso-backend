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

  // A semana de treino é segunda a sexta.
  const endDate = new Date(startDate)
  endDate.setUTCDate(endDate.getUTCDate() + 4)
  endDate.setUTCHours(26, 59, 59, 999) // 23:59:59 em America/Sao_Paulo (-03:00)

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

export function isWeekAutomaticallyReleased(week, now = new Date()) {
  return week.startDate <= now
}

export async function syncAutomaticWeekReleases(prisma, studentId, now = new Date()) {
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
