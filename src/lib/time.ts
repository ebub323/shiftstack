/**
 * Wall-clock time in a named zone, converted to and from instants.
 * Everything here goes through Intl, so the zone database does the daylight-saving work.
 */
const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
    fmtCache.set(tz, f);
  }
  return f;
}

export function isValidTz(tz: string): boolean {
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch { return false; }
}

interface Wall { y: number; mo: number; d: number; h: number; mi: number; s: number }
export function wallClock(ms: number, tz: string): Wall {
  const parts = Object.fromEntries(fmt(tz).formatToParts(new Date(ms)).filter((p) => p.type !== "literal").map((p) => [p.type, Number(p.value)]));
  return { y: parts.year, mo: parts.month, d: parts.day, h: parts.hour, mi: parts.minute, s: parts.second };
}

/** The zone's offset from UTC at an instant, in ms (east of UTC is positive). */
export function offsetMs(ms: number, tz: string): number {
  const w = wallClock(ms, tz);
  return Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, w.s) - Math.floor(ms / 1000) * 1000;
}

const pad = (n: number) => String(n).padStart(2, "0");
export const dateOf = (ms: number, tz: string) => { const w = wallClock(ms, tz); return `${w.y}-${pad(w.mo)}-${pad(w.d)}`; };
export const timeOf = (ms: number, tz: string) => { const w = wallClock(ms, tz); return `${pad(w.h)}:${pad(w.mi)}`; };

/**
 * The instant at which a zone's clock reads `date` `time`.
 *
 * Two awkward cases, and what is done about them:
 *  - A time that happens TWICE (clocks go back): the first one is used.
 *  - A time that NEVER happens (clocks go forward): it moves forward by the gap, so 02:30 becomes 03:30.
 */
export function zonedToUtc(date: string, time: string, tz: string): number {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const before = offsetMs(guess - 36 * 3600_000, tz);
  const after = offsetMs(guess + 36 * 3600_000, tz);
  const reads = (utc: number) => { const w = wallClock(utc, tz); return w.y === y && w.mo === mo && w.d === d && w.h === h && w.mi === mi; };
  const cands = [...new Set([guess - before, guess - after])].sort((a, b) => a - b);
  const valid = cands.filter(reads);
  if (valid.length) return valid[0];
  return guess - before;     // in a gap: apply the offset from before the change, which lands after it
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}
/** 0 = Sunday. A calendar date has one weekday everywhere, so no zone is needed. */
export const weekdayOf = (date: string) => { const [y, m, d] = date.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };
const dayNumber = (date: string) => { const [y, m, d] = date.split("-").map(Number); return Date.UTC(y, m - 1, d) / 86_400_000; };
export const daysBetween = (a: string, b: string) => Math.round(dayNumber(b) - dayNumber(a));
export const startOfWeek = (date: string, weekStart: number) => addDays(date, -((weekdayOf(date) - weekStart + 7) % 7));
export const minutesOf = (time: string) => { const [h, m] = time.split(":").map(Number); return h * 60 + m; };
