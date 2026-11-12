"use client";
import { addDays, dateOf, minutesOf, timeOf, weekdayOf, zonedToUtc } from "@/lib/time";
import type { Conflict, Instance } from "@/lib/types";

const LAST = 24 * 60;
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const TONE = { class: "border-blue-500 bg-blue-500/15 text-blue-900 dark:text-blue-100", shift: "border-emerald-500 bg-emerald-500/15 text-emerald-900 dark:text-emerald-100", other: "border-neutral-400 bg-neutral-400/15" } as const;

interface Seg { inst: Instance; startMin: number; endMin: number; cont: "from" | "to" | null }

/** An event that crosses midnight is drawn on both days it touches. */
function segmentsFor(i: Instance, date: string, tz: string): Seg | null {
  const dayStart = zonedToUtc(date, "00:00", tz), dayEnd = zonedToUtc(addDays(date, 1), "00:00", tz);
  if (i.endMs <= dayStart || i.startMs >= dayEnd) return null;
  const s = Math.max(i.startMs, dayStart), e = Math.min(i.endMs, dayEnd);
  const startMin = minutesOf(timeOf(s, tz)), endMin = e === dayEnd ? 1440 : minutesOf(timeOf(e, tz));
  return { inst: i, startMin, endMin, cont: i.startMs < dayStart ? "from" : i.endMs > dayEnd ? "to" : null };
}

export default function WeekGrid({ weekStart, instances, conflicts, tz, onPick }: { weekStart: string; instances: Instance[]; conflicts: Conflict[]; tz: string; onPick: (eventId: string) => void }) {
  const days = Array.from({ length: 7 }, (_, k) => addDays(weekStart, k));
  // Show 6am to midnight, but open the grid up to the early hours whenever something actually happens then.
  const earliest = Math.min(1440, ...days.flatMap((d) => instances.map((i) => segmentsFor(i, d, tz)).filter((x): x is Seg => !!x).map((x) => x.startMin)));
  const FIRST = earliest < 6 * 60 ? 0 : 6 * 60;
  const SPAN = LAST - FIRST;
  const height = ((LAST - FIRST) / 60) * 30;
  const hard = new Set(conflicts.filter((c) => c.kind === "overlap").flatMap((c) => [c.a.eventId + c.a.startMs, c.b.eventId + c.b.startMs]));
  const tight = new Set(conflicts.filter((c) => c.kind === "tight").flatMap((c) => [c.a.eventId + c.a.startMs, c.b.eventId + c.b.startMs]));
  const today = dateOf(Date.now(), tz);
  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[44rem] grid-cols-[3rem_repeat(7,1fr)] text-xs">
        <div />
        {days.map((d) => (
          <div key={d} className={`border-b border-neutral-200 px-1 pb-2 text-center dark:border-neutral-800 ${d === today ? "font-semibold" : "text-neutral-500"}`}>
            {DAYS[weekdayOf(d)]} <span className={d === today ? "rounded-full bg-neutral-900 px-1.5 py-0.5 text-white dark:bg-white dark:text-neutral-900" : ""}>{Number(d.slice(8))}</span>
          </div>
        ))}
        <div className="relative" style={{ height }}>
          {Array.from({ length: 25 }, (_, h) => h).filter((h) => h >= FIRST / 60 && h % 2 === 0).map((h) => (
            <div key={h} className="absolute right-1 -translate-y-1/2 text-[10px] text-neutral-400" style={{ top: `${((h * 60 - FIRST) / SPAN) * 100}%` }}>{h === 24 ? "" : `${h % 12 || 12}${h < 12 ? "a" : "p"}`}</div>
          ))}
        </div>
        {days.map((d) => {
          const segs = instances.map((i) => segmentsFor(i, d, tz)).filter((x): x is Seg => !!x);
          return (
            <div key={d} className="relative border-l border-neutral-100 dark:border-neutral-800" style={{ height }}>
              {Array.from({ length: Math.ceil(SPAN / 120) }, (_, k) => <div key={k} className="absolute inset-x-0 border-t border-neutral-100 dark:border-neutral-800/60" style={{ top: `${((k * 120) / SPAN) * 100}%` }} />)}
              {segs.map((s) => {
                const top = Math.max(0, ((s.startMin - FIRST) / SPAN) * 100), bottom = Math.min(100, ((s.endMin - FIRST) / SPAN) * 100);
                if (bottom <= 0 || top >= 100) return null;
                const key = s.inst.eventId + s.inst.startMs;
                const ring = hard.has(key) ? "ring-2 ring-red-500" : tight.has(key) ? "ring-2 ring-amber-500" : "";
                return (
                  <button key={key + d} onClick={() => onPick(s.inst.eventId)} title={`${s.inst.title} ${timeOf(s.inst.startMs, tz)} to ${timeOf(s.inst.endMs, tz)}`}
                    className={`absolute inset-x-0.5 overflow-hidden rounded-md border-l-4 px-1 py-0.5 text-left leading-tight ${TONE[s.inst.kind]} ${ring}`} style={{ top: `${top}%`, height: `${Math.max(bottom - top, 2.5)}%` }}>
                    <div className="truncate font-medium">{s.cont === "from" ? "↳ " : ""}{s.inst.title}{s.cont === "to" ? " ↴" : ""}</div>
                    <div className="truncate text-[10px] opacity-75">{timeOf(s.inst.startMs, tz)} to {timeOf(s.inst.endMs, tz)}{s.inst.dstShifted ? ` · ${(s.inst.minutes / 60).toFixed(0)}h (clock change)` : ""}</div>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
