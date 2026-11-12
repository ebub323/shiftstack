import type { Conflict, Earnings, EventDef, Instance, Settings, WeekTotal, Window } from "./types";
import { addDays, daysBetween, dateOf, minutesOf, startOfWeek, weekdayOf, zonedToUtc } from "./time";

const hasBreak = (e: EventDef, minutes: number) => !!e.unpaidBreakMin && minutes >= (e.breakAfterHours ?? 5) * 60;

function makeInstance(e: EventDef, date: string, homeTz: string): Instance {
  const startMs = zonedToUtc(date, e.start, e.tz);
  const overnight = minutesOf(e.end) <= minutesOf(e.start);
  const endMs = zonedToUtc(overnight ? addDays(date, 1) : date, e.end, e.tz);
  const minutes = Math.round((endMs - startMs) / 60000);
  const nominal = (minutesOf(e.end) - minutesOf(e.start) + (overnight ? 1440 : 0));
  const paid = e.kind === "shift" ? minutes - (hasBreak(e, minutes) ? e.unpaidBreakMin ?? 0 : 0) : 0;
  return {
    eventId: e.id, title: e.title, kind: e.kind, startMs, endMs, date: dateOf(startMs, homeTz), minutes, paidMinutes: Math.max(0, paid),
    hourly: e.kind === "shift" ? e.hourly ?? 0 : 0, employer: e.employer ?? e.title, dstShifted: minutes !== nominal, nominalMinutes: nominal,
  };
}

/**
 * Turn repeating definitions into concrete instances between two dates (in the
 * viewer's zone, inclusive). An event is generated on its own zone's dates and
 * kept if it overlaps the window, so a late shift in another zone is not lost.
 */
export function expand(events: EventDef[], from: string, to: string, homeTz: string): Instance[] {
  const lo = zonedToUtc(from, "00:00", homeTz);
  const hi = zonedToUtc(addDays(to, 1), "00:00", homeTz);
  const out: Instance[] = [];
  for (const e of events) {
    const dates: string[] = [];
    if (e.rule) {
      const r = e.rule; const step = Math.max(1, r.everyWeeks ?? 1);
      const first = r.startDate > addDays(from, -2) ? r.startDate : addDays(from, -2);
      const last = r.until && r.until < addDays(to, 2) ? r.until : addDays(to, 2);
      const anchor = startOfWeek(r.startDate, 0);
      for (let d = first; d <= last; d = addDays(d, 1)) {
        if (!r.days.includes(weekdayOf(d))) continue;
        if (r.except?.includes(d)) continue;
        const weeks = Math.floor(daysBetween(anchor, startOfWeek(d, 0)) / 7);
        if (weeks % step !== 0) continue;
        dates.push(d);
      }
    } else if (e.date) dates.push(e.date);
    for (const d of dates) {
      const inst = makeInstance(e, d, homeTz);
      if (inst.endMs > lo && inst.startMs < hi) out.push(inst);
    }
  }
  return out.sort((a, b) => a.startMs - b.startMs || a.eventId.localeCompare(b.eventId));
}

/**
 * Where two commitments cannot both be kept. An overlap is a hard conflict. A
 * class followed closely by a shift (or the reverse) is "tight" when the gap is
 * shorter than the travel time wanted between them.
 */
export function findConflicts(instances: Instance[], bufferMin: number): Conflict[] {
  const xs = [...instances].sort((a, b) => a.startMs - b.startMs);
  const out: Conflict[] = [];
  for (let i = 0; i < xs.length; i++) {
    for (let j = i + 1; j < xs.length; j++) {
      const a = xs[i], b = xs[j];
      const needed = a.kind !== b.kind && a.kind !== "other" && b.kind !== "other" ? bufferMin : 0;
      if (b.startMs >= a.endMs + needed * 60000) break;      // sorted by start, so nothing later can touch a
      if (a.eventId === b.eventId && a.startMs === b.startMs) continue;
      if (b.startMs < a.endMs) out.push({ a, b, kind: "overlap", minutes: Math.round((Math.min(a.endMs, b.endMs) - b.startMs) / 60000) });
      else out.push({ a, b, kind: "tight", minutes: Math.round((a.endMs + needed * 60000 - b.startMs) / 60000) });
    }
  }
  return out;
}

/**
 * Pay by week. Hours beyond the overtime threshold are paid at the multiplier,
 * counted per employer because overtime law follows the employer, not the person.
 */
export function earnings(instances: Instance[], s: Pick<Settings, "homeTz" | "weekStart" | "overtimeAfterHours" | "overtimeMultiplier">): Earnings {
  const weeks = new Map<string, Map<string, { minutes: number; hourly: number }>>();
  for (const i of instances) {
    if (i.kind !== "shift" || i.paidMinutes <= 0) continue;
    const wk = startOfWeek(i.date, s.weekStart);
    const emp = weeks.get(wk) ?? new Map(); weeks.set(wk, emp);
    const cur = emp.get(i.employer) ?? { minutes: 0, hourly: 0 };
    // an employer with several rates is paid each shift at its own rate; track the weighted pay separately
    cur.minutes += i.paidMinutes; cur.hourly += (i.paidMinutes / 60) * i.hourly;
    emp.set(i.employer, cur);
  }
  const out: WeekTotal[] = [];
  for (const [weekStart, emp] of [...weeks.entries()].sort()) {
    let hours = 0, ot = 0, pay = 0;
    for (const { minutes, hourly: straightPay } of emp.values()) {
      const h = minutes / 60; const over = Math.max(0, h - s.overtimeAfterHours);
      const avgRate = h > 0 ? straightPay / h : 0;
      hours += h; ot += over; pay += straightPay + over * avgRate * (s.overtimeMultiplier - 1);
    }
    out.push({ weekStart, hours: round(hours), overtimeHours: round(ot), pay: round(pay) });
  }
  return { weeks: out, total: round(out.reduce((a, w) => a + w.pay, 0)), hours: round(out.reduce((a, w) => a + w.hours, 0)) };
}
const round = (n: number) => Math.round(n * 100) / 100;

/** Free stretches in each day's waking window, after leaving the travel buffer around everything. */
export function freeWindows(instances: Instance[], from: string, to: string, tz: string, opts: { dayStart: string; dayEnd: string; minMinutes: number; bufferMin: number }): Window[] {
  const out: Window[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const lo = zonedToUtc(d, opts.dayStart, tz), hi = zonedToUtc(d, opts.dayEnd, tz);
    const busy = instances.filter((i) => i.endMs > lo - opts.bufferMin * 60000 && i.startMs < hi + opts.bufferMin * 60000)
      .map((i) => [i.startMs - opts.bufferMin * 60000, i.endMs + opts.bufferMin * 60000] as const).sort((a, b) => a[0] - b[0]);
    let cursor = lo;
    for (const [s, e] of busy) { if (s > cursor) push(cursor, Math.min(s, hi)); cursor = Math.max(cursor, e); }
    if (cursor < hi) push(cursor, hi);
    function push(s: number, e: number) { const minutes = Math.round((e - s) / 60000); if (minutes >= opts.minMinutes) out.push({ date: d, startMs: s, endMs: e, minutes }); }
  }
  return out;
}

/** Hours of shift work needed to reach a monthly target at a given hourly rate. */
export const hoursNeeded = (target: number, hourly: number) => (hourly > 0 ? round(target / hourly) : Infinity);

/** A calendar file of concrete instances, in UTC so every calendar reads it the same way. */
export function toIcs(instances: Instance[], name: string): string {
  const stamp = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const esc = (s: string) => s.replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//ShiftStack//EN", "CALSCALE:GREGORIAN", `X-WR-CALNAME:${esc(name)}`];
  for (const i of instances) {
    lines.push("BEGIN:VEVENT", `UID:${i.eventId}-${i.startMs}@shiftstack`, `DTSTAMP:${stamp(Date.now())}`, `DTSTART:${stamp(i.startMs)}`, `DTEND:${stamp(i.endMs)}`, `SUMMARY:${esc(i.title)}`, `CATEGORIES:${i.kind}`, "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
