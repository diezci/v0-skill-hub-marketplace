const madridDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" })

export function calendarWorkEnd(item: { estado: string; fecha_fin?: string | null; fecha_estimada_fin?: string | null }) {
  return ['completado', 'cancelado'].includes(item.estado)
    ? item.fecha_fin || item.fecha_estimada_fin || null
    : item.fecha_estimada_fin || null
}
export function localCalendarDay(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function calendarDateKey(value: string) {
  // Contract deadlines are agreed in Madrid; a viewer travelling abroad must
  // not move the contractual day. Personal timed events use calendar-events.
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : madridDay.format(new Date(value))
}

export function calendarContractDate(value: string) {
  return new Date(`${calendarDateKey(value)}T12:00:00`)
}
