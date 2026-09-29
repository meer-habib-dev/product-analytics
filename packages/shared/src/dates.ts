/**
 * Aggregates are bucketed in UTC so a bucket never depends on the viewer's
 * timezone or on the device that sent the event.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export function utcDay(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

export function utcMonth(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 7);
}

/** ISO-8601 week, e.g. "2026-W40". Weeks start on Monday and belong to the year of their Thursday. */
export function isoWeek(timestamp: number): string {
  const date = new Date(timestamp);
  const day = date.getUTCDay() || 7;
  const thursday = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 4 - day);
  const year = new Date(thursday).getUTCFullYear();
  const week = Math.ceil(((thursday - Date.UTC(year, 0, 1)) / DAY_MS + 1) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

export function startOfUtcDay(timestamp: number): number {
  const d = new Date(timestamp);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export function dayToTimestamp(day: string): number {
  return Date.parse(`${day}T00:00:00.000Z`);
}

/** Inclusive list of UTC days between two day strings. */
export function daysBetween(fromDay: string, toDay: string): string[] {
  const days: string[] = [];
  const end = dayToTimestamp(toDay);
  for (let t = dayToTimestamp(fromDay); t <= end; t += DAY_MS) days.push(utcDay(t));
  return days;
}

export function addDays(day: string, amount: number): string {
  return utcDay(dayToTimestamp(day) + amount * DAY_MS);
}

export { DAY_MS };
