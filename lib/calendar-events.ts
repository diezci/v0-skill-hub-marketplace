// Shared event validation and local-date formatting. All-day values are calendar
// dates; timed values are instants displayed in the browser's local time zone.
export type CalendarEventInput = {
  titulo: string; descripcion?: string | null; fecha_inicio: string; fecha_fin?: string | null
  color?: string; tipo?: string; todo_el_dia?: boolean; ubicacion?: string | null
}

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)) return false
  const day = value.slice(0, 10), parsed = new Date(day + "T12:00:00Z")
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === day && Number.isFinite(Date.parse(value))
}

export function validateCalendarEvent(input: CalendarEventInput): string | null {
  if (typeof input.titulo !== "string" || !input.titulo.trim() || input.titulo.trim().length > 200) return "Indica un título de entre 1 y 200 caracteres."
  if (!validDate(input.fecha_inicio) || (input.fecha_fin != null && input.fecha_fin !== "" && !validDate(input.fecha_fin))) return "Indica fechas válidas para el evento."
  if (input.fecha_fin && Date.parse(input.fecha_fin) < Date.parse(input.fecha_inicio)) return "La fecha de fin no puede ser anterior al inicio."
  if (input.todo_el_dia === false && (!input.fecha_inicio.includes("T") || (input.fecha_fin && !input.fecha_fin.includes("T")))) return "Indica la hora de inicio y de fin del evento."
  return null
}

export function calendarDate(value: string, allDay: boolean): string {
  if (allDay) return value.slice(0, 10)
  const date = new Date(value)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}
export function calendarTime(value: string): string {
  const date = new Date(value)
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`
}
export function calendarInstant(day: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^\d{2}:\d{2}$/.test(time)) return null
  const date = new Date(`${day}T${time}:00`)
  // Reject non-existent local times (for example the spring DST gap), not
  // silently move the user's event into a different hour.
  if (!Number.isFinite(date.getTime()) || calendarDate(date.toISOString(), false) !== day || calendarTime(date.toISOString()) !== time) return null
  return date.toISOString()
}
