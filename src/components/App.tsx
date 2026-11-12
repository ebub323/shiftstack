"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_SETTINGS, SAMPLE_EVENTS, ZONES } from "@/lib/sample";
import { earnings, expand, findConflicts, freeWindows, hoursNeeded, toIcs } from "@/lib/schedule";
import { addDays, dateOf, isValidTz, startOfWeek, timeOf, zonedToUtc } from "@/lib/time";
import type { EventDef, Settings } from "@/lib/types";
import EventForm from "./EventForm";
import WeekGrid from "./WeekGrid";
import { Bar, btn, btnGhost, card, Chip, input } from "./ui";

const KEY = "shiftstack:v1";
const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
const hrs = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)}h`;

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
}
const browserTz = () => { try { const z = Intl.DateTimeFormat().resolvedOptions().timeZone; return isValidTz(z) ? z : DEFAULT_SETTINGS.homeTz; } catch { return DEFAULT_SETTINGS.homeTz; } };

export default function App() {
  const [events, setEvents] = useState<EventDef[]>(SAMPLE_EVENTS);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [isSample, setIsSample] = useState(true);
  const [anchor, setAnchor] = useState("2026-11-01");           // a date inside the week being viewed
  const [editing, setEditing] = useState<EventDef | "new" | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [notice, setNotice] = useState("");
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) { const s = JSON.parse(raw) as { events: EventDef[]; settings: Settings; isSample: boolean; anchor?: string }; setEvents(s.events); setSettings({ ...DEFAULT_SETTINGS, ...s.settings }); setIsSample(s.isSample); if (s.anchor) setAnchor(s.anchor); }
      else { const t = dateOf(Date.now(), DEFAULT_SETTINGS.homeTz); setAnchor(t > "2026-12-11" || t < "2026-08-31" ? "2026-11-01" : t); }
    } catch { /* corrupt save */ }
    setHydrated(true);
  }, []);
  useEffect(() => { if (hydrated) try { localStorage.setItem(KEY, JSON.stringify({ events, settings, isSample, anchor })); } catch { /* storage unavailable */ } }, [events, settings, isSample, anchor, hydrated]);

  const tz = settings.homeTz;
  const weekStart = startOfWeek(anchor, settings.weekStart);
  const weekEnd = addDays(weekStart, 6);
  const monthKey = addDays(weekStart, 3).slice(0, 7);
  const monthFirst = `${monthKey}-01`;
  const monthLast = addDays(`${addDays(monthFirst, 32).slice(0, 7)}-01`, -1);

  const week = useMemo(() => {
    // everything that overlaps this week in the viewer's zone, including a night shift that started the evening before
    const lo = zonedToUtc(weekStart, "00:00", tz), hi = zonedToUtc(addDays(weekEnd, 1), "00:00", tz);
    return expand(events, addDays(weekStart, -1), weekEnd, tz).filter((i) => i.endMs > lo && i.startMs < hi);
  }, [events, weekStart, weekEnd, tz]);
  const weekConflicts = useMemo(() => findConflicts(week, settings.bufferMin), [week, settings.bufferMin]);
  const horizon = useMemo(() => expand(events, weekStart, addDays(weekStart, 55), tz), [events, weekStart, tz]);
  const horizonConflicts = useMemo(() => findConflicts(horizon, settings.bufferMin), [horizon, settings.bufferMin]);
  const monthInst = useMemo(() => expand(events, addDays(startOfWeek(monthFirst, settings.weekStart), 0), addDays(monthLast, 7), tz), [events, monthFirst, monthLast, settings.weekStart, tz]);
  const monthPay = useMemo(() => {
    const e = earnings(monthInst, settings);
    const inMonth = e.weeks.filter((w) => w.weekStart.slice(0, 7) === monthKey || (w.weekStart < monthFirst && addDays(w.weekStart, 6) >= monthFirst));
    return { pay: inMonth.reduce((s, w) => s + w.pay, 0), hours: inMonth.reduce((s, w) => s + w.hours, 0), ot: inMonth.reduce((s, w) => s + w.overtimeHours, 0) };
  }, [monthInst, settings, monthKey, monthFirst]);
  const weekPay = useMemo(() => earnings(week.filter((i) => i.date >= weekStart && i.date <= weekEnd), settings).weeks[0], [week, weekStart, weekEnd, settings]);
  const free = useMemo(() => freeWindows(week.filter((i) => i.date >= weekStart), weekStart, weekEnd, tz, { dayStart: "08:00", dayEnd: "22:00", minMinutes: 90, bufferMin: settings.bufferMin }), [week, weekStart, weekEnd, tz, settings.bufferMin]);
  const avgRate = useMemo(() => { const sh = events.filter((e) => e.kind === "shift" && e.hourly); return sh.length ? sh.reduce((s, e) => s + (e.hourly ?? 0), 0) / sh.length : 0; }, [events]);
  const gap = Math.max(0, settings.monthlyTarget - monthPay.pay);
  const dstNights = week.filter((i) => i.dstShifted);
  const today = dateOf(Date.now(), tz);

  const mutate = (fn: (e: EventDef[]) => EventDef[]) => { setEvents(fn); setIsSample(false); };
  const save = (e: EventDef) => { mutate((xs) => (xs.some((x) => x.id === e.id) ? xs.map((x) => (x.id === e.id ? e : x)) : [...xs, e])); setEditing(null); };
  const set = (patch: Partial<Settings>) => setSettings({ ...settings, ...patch });

  const importJson = async (f: File) => {
    try {
      const d = JSON.parse(await f.text()) as { events?: EventDef[]; settings?: Settings };
      if (!Array.isArray(d.events) || d.events.some((e) => !e || typeof e.id !== "string" || !isValidTz(e.tz))) throw new Error();
      setEvents(d.events); if (d.settings) setSettings({ ...DEFAULT_SETTINGS, ...d.settings }); setIsSample(false); setNotice("Schedule imported.");
    } catch { setNotice("That file is not a ShiftStack schedule."); }
  };

  return (
    <div className="mx-auto max-w-7xl px-5 py-10">
      <header>
        <div className="flex items-center gap-2 text-sm font-semibold tracking-tight"><span className="grid size-7 place-items-center rounded-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-900">S</span>ShiftStack</div>
        <h1 className="mt-6 text-4xl font-semibold tracking-tight">Classes and shifts, without the collisions.</h1>
        <p className="mt-4 max-w-2xl text-neutral-600 dark:text-neutral-400">
          See conflicts before they happen, what you will really earn (breaks and overtime included), and when you are free. Recurring events are kept
          as clock times in a time zone, so a 9am class stays at 9am when the clocks change, and a 10pm to 6am shift is correctly 9 hours on the night they go back.
        </p>
        {isSample && <p className="mt-3 inline-block rounded-lg bg-amber-500/10 px-3 py-1.5 text-sm text-amber-900 dark:text-amber-200">This is a made-up sample schedule. Edit it, or start your own.</p>}
        {notice && <p role="status" className="mt-3 block rounded-lg bg-neutral-100 px-3 py-1.5 text-sm dark:bg-neutral-800">{notice} <button className="ml-2 underline" onClick={() => setNotice("")}>Dismiss</button></p>}
      </header>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-4">
        <section className={`${card} min-w-0 p-4 lg:col-span-3`}>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <button className={btnGhost} onClick={() => setAnchor(addDays(weekStart, -7))} aria-label="Previous week">←</button>
            <button className={btnGhost} onClick={() => setAnchor(addDays(weekStart, 7))} aria-label="Next week">→</button>
            <button className={btnGhost} onClick={() => setAnchor(today)}>Today</button>
            <h2 className="text-lg font-semibold">{weekStart} to {weekEnd}</h2>
            <span className="ml-auto flex gap-2 text-xs text-neutral-500"><span><i className="mr-1 inline-block size-2 rounded-sm bg-blue-500" />class</span><span><i className="mr-1 inline-block size-2 rounded-sm bg-emerald-500" />shift</span><span><i className="mr-1 inline-block size-2 rounded-sm ring-2 ring-red-500" />overlap</span><span><i className="mr-1 inline-block size-2 rounded-sm ring-2 ring-amber-500" />too tight</span></span>
          </div>
          <WeekGrid weekStart={weekStart} instances={week} conflicts={weekConflicts} tz={tz} onPick={(id) => setEditing(events.find((e) => e.id === id) ?? null)} />
          {dstNights.length > 0 && <p className="mt-3 rounded-lg bg-blue-500/10 p-2 text-sm text-blue-900 dark:text-blue-200">Clocks change this week: {dstNights.map((d) => `${d.title} on ${d.date} runs ${hrs(d.minutes / 60)} instead of ${hrs(d.nominalMinutes / 60)}`).join("; ")}. Hours and pay already reflect it.</p>}
        </section>

        <aside className="min-w-0 space-y-4">
          <section className={`${card} p-4`}>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">This week</h3>
            <div className="mt-2 flex items-end justify-between"><div className="text-3xl font-semibold tabular-nums">{money(weekPay?.pay ?? 0)}</div><div className="text-right text-xs text-neutral-500">{hrs(weekPay?.hours ?? 0)} worked{weekPay && weekPay.overtimeHours > 0 ? <span className="block text-amber-700 dark:text-amber-400">{hrs(weekPay.overtimeHours)} overtime</span> : null}</div></div>
          </section>
          <section className={`${card} p-4`}>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{monthKey} against your target</h3>
            <div className="mt-2 flex justify-between text-sm"><span className="font-medium">{money(monthPay.pay)}</span><span className="text-neutral-500">of {money(settings.monthlyTarget)}</span></div>
            <div className="mt-2"><Bar value={monthPay.pay} max={settings.monthlyTarget} tone={monthPay.pay >= settings.monthlyTarget ? "bg-emerald-500" : "bg-neutral-900 dark:bg-white"} /></div>
            <p className="mt-2 text-xs text-neutral-500">{gap === 0 ? "Target met on this schedule." : avgRate > 0 ? `${money(gap)} short: about ${hrs(hoursNeeded(gap, avgRate))} more at your average ${money(avgRate)} an hour.` : `${money(gap)} short.`}</p>
            <label className="mt-3 block text-xs text-neutral-500">Monthly target<input type="number" min={0} step={50} className={`${input} mt-1`} value={settings.monthlyTarget} onChange={(e) => set({ monthlyTarget: Number(e.target.value) })} /></label>
          </section>
          <section className={`${card} p-4`}>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Conflicts <span className="font-mono">{horizonConflicts.length}</span> <span className="font-normal normal-case">in the next 8 weeks</span></h3>
            {horizonConflicts.length === 0 ? <p className="mt-2 text-sm text-emerald-700 dark:text-emerald-400">None. Nothing collides.</p> : (
              <ul className="mt-2 space-y-2 text-sm">
                {horizonConflicts.slice(0, 6).map((c, k) => (
                  <li key={k}><button className="w-full text-left" onClick={() => setAnchor(c.a.date)}>
                    <div className="flex items-center gap-2">{c.kind === "overlap" ? <Chip tone="red">Overlap {c.minutes} min</Chip> : <Chip tone="amber">{c.minutes} min short</Chip>}<span className="text-xs text-neutral-500">{c.a.date}</span></div>
                    <div className="mt-0.5 text-xs">{c.a.title} ({timeOf(c.a.startMs, tz)}) and {c.b.title} ({timeOf(c.b.startMs, tz)})</div></button></li>
                ))}
                {horizonConflicts.length > 6 && <li className="text-xs text-neutral-400">and {horizonConflicts.length - 6} more</li>}
              </ul>
            )}
          </section>
          <section className={`${card} p-4`}>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Free this week <span className="font-normal normal-case">(90 min or more)</span></h3>
            <ul className="mt-2 space-y-1 text-sm">{free.slice(0, 6).map((w) => <li key={w.startMs} className="flex justify-between"><span>{w.date.slice(5)} {timeOf(w.startMs, tz)} to {timeOf(w.endMs, tz)}</span><span className="text-xs text-neutral-500">{hrs(w.minutes / 60)}</span></li>)}{free.length === 0 && <li className="text-neutral-400">No gaps that long.</li>}</ul>
          </section>
        </aside>
      </div>

      <section className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className={`${card} min-w-0 p-5 lg:col-span-2`}>
          <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Your schedule</h2><button className={btn} onClick={() => setEditing("new")}>+ Add</button></div>
          {editing && <div className="mt-4 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800"><EventForm key={editing === "new" ? "new" : editing.id} initial={editing === "new" ? undefined : editing} homeTz={tz} today={today} onSave={save} onCancel={() => setEditing(null)} /></div>}
          <ul className="mt-3 divide-y divide-neutral-100 dark:divide-neutral-800">
            {events.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                <Chip tone={e.kind === "class" ? "blue" : e.kind === "shift" ? "green" : "gray"}>{e.kind}</Chip>
                <div className="min-w-40 flex-1"><div className="font-medium">{e.title}</div><div className="text-xs text-neutral-500">{e.start} to {e.end} {e.tz !== tz ? `(${e.tz})` : ""} · {e.rule ? ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].filter((_, i) => e.rule!.days.includes(i)).join(" ") + (e.rule.everyWeeks && e.rule.everyWeeks > 1 ? `, every ${e.rule.everyWeeks} weeks` : "") : e.date}{e.hourly ? ` · ${money(e.hourly)}/h` : ""}</div></div>
                <button className={btnGhost} onClick={() => setEditing(e)}>Edit</button>
                <button className="text-xs text-red-600 hover:underline" onClick={() => mutate((xs) => xs.filter((x) => x.id !== e.id))}>Remove</button>
              </li>
            ))}
            {events.length === 0 && <li className="py-6 text-center text-sm text-neutral-400">Nothing scheduled. Add a class or a shift.</li>}
          </ul>
        </div>

        <div className="min-w-0 space-y-6">
          <div className={`${card} p-5`}>
            <h2 className="text-lg font-semibold">Settings</h2>
            <div className="mt-3 space-y-3 text-sm">
              <label className="block text-xs text-neutral-500">Your time zone<select className={`${input} mt-1`} value={tz} onChange={(e) => set({ homeTz: e.target.value })}>{[...new Set([tz, browserTz(), ...ZONES])].map((z) => <option key={z}>{z}</option>)}</select></label>
              <label className="block text-xs text-neutral-500">Travel time between a class and a shift: <span className="font-mono">{settings.bufferMin} min</span><input type="range" min={0} max={90} step={5} className="mt-1 w-full accent-neutral-900 dark:accent-white" value={settings.bufferMin} onChange={(e) => set({ bufferMin: Number(e.target.value) })} /></label>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs text-neutral-500">Overtime after<input type="number" min={1} className={`${input} mt-1`} value={settings.overtimeAfterHours} onChange={(e) => set({ overtimeAfterHours: Number(e.target.value) })} /></label>
                <label className="text-xs text-neutral-500">Paid at<input type="number" min={1} step={0.25} className={`${input} mt-1`} value={settings.overtimeMultiplier} onChange={(e) => set({ overtimeMultiplier: Number(e.target.value) })} /></label>
              </div>
              <label className="block text-xs text-neutral-500">Pay week starts<select className={`${input} mt-1`} value={settings.weekStart} onChange={(e) => set({ weekStart: Number(e.target.value) })}>{["Sunday", "Monday", "Saturday"].map((d, i) => <option key={d} value={[0, 1, 6][i]}>{d}</option>)}</select></label>
            </div>
          </div>
          <div className={`${card} p-5`}>
            <h2 className="text-lg font-semibold">Take it with you</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              <button className={btn} onClick={() => download("shiftstack.ics", toIcs(horizon, "ShiftStack"), "text/calendar")}>Calendar file (.ics)</button>
              <button className={btnGhost} onClick={() => download("shiftstack-schedule.json", JSON.stringify({ events, settings }, null, 2), "application/json")}>Save schedule</button>
              <button className={btnGhost} onClick={() => importRef.current?.click()}>Load schedule</button>
              <input ref={importRef} type="file" accept="application/json,.json" className="hidden" data-testid="schedule-file" onChange={(e) => { const f = e.target.files?.[0]; if (f) void importJson(f); e.target.value = ""; }} />
              <button className={btnGhost} onClick={() => { setEvents(SAMPLE_EVENTS); setSettings(DEFAULT_SETTINGS); setIsSample(true); }}>Reset to sample</button>
            </div>
            <p className="mt-3 text-xs text-neutral-500">The calendar file holds the next eight weeks as concrete events in UTC, so every calendar app shows them at the right local time.</p>
          </div>
        </div>
      </section>

      <footer className="mt-12 border-t border-neutral-200 pt-5 text-xs leading-relaxed text-neutral-500 dark:border-neutral-800">
        Overtime is counted per employer over the pay week, at the multiplier you set. Whether you are owed it, and at what threshold, depends on where you work: check your own rules. Your schedule stays in this browser.
      </footer>
    </div>
  );
}
