"use client";
import { useState } from "react";
import { ZONES } from "@/lib/sample";
import { isValidTz } from "@/lib/time";
import type { EventDef, Kind } from "@/lib/types";
import { btn, btnGhost, input } from "./ui";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const blank = (tz: string, today: string): EventDef => ({ id: "", title: "", kind: "shift", tz, start: "09:00", end: "17:00", hourly: 15, rule: { days: [1], startDate: today } });

export default function EventForm({ initial, homeTz, today, onSave, onCancel }: { initial?: EventDef; homeTz: string; today: string; onSave: (e: EventDef) => void; onCancel: () => void }) {
  const [e, setE] = useState<EventDef>(initial ?? blank(homeTz, today));
  const [oneOff, setOneOff] = useState(!!initial && !initial.rule);
  const [error, setError] = useState("");
  const set = <K extends keyof EventDef>(k: K, v: EventDef[K]) => setE({ ...e, [k]: v });
  const rule = e.rule ?? { days: [1], startDate: today };
  const setRule = (patch: Partial<NonNullable<EventDef["rule"]>>) => setE({ ...e, rule: { ...rule, ...patch } });

  const save = () => {
    if (!e.title.trim()) return setError("Give it a name.");
    if (!isValidTz(e.tz)) return setError("That time zone is not recognised.");
    if (e.start === e.end) return setError("Start and end are the same time. Make the end later, or earlier to run past midnight.");
    if (!oneOff && rule.days.length === 0) return setError("Pick at least one day.");
    if (!oneOff && rule.until && rule.until < rule.startDate) return setError("It ends before it starts.");
    const base: EventDef = { ...e, id: e.id || `e${Date.now().toString(36)}`, title: e.title.trim() };
    if (oneOff) { delete base.rule; base.date = base.date ?? today; } else { delete base.date; base.rule = rule; }
    if (base.kind !== "shift") { delete base.hourly; delete base.employer; delete base.unpaidBreakMin; delete base.breakAfterHours; }
    onSave(base);
  };

  return (
    <div className="space-y-3 text-sm">
      <div className="grid grid-cols-3 gap-2">
        <label className="col-span-2 text-xs text-neutral-500">Name<input className={`${input} mt-1`} value={e.title} onChange={(ev) => set("title", ev.target.value)} placeholder="Calculus, Library desk..." /></label>
        <label className="text-xs text-neutral-500">Kind<select className={`${input} mt-1`} value={e.kind} onChange={(ev) => set("kind", ev.target.value as Kind)}><option value="class">Class</option><option value="shift">Shift</option><option value="other">Other</option></select></label>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <label className="text-xs text-neutral-500">Starts<input type="time" className={`${input} mt-1`} value={e.start} onChange={(ev) => set("start", ev.target.value)} /></label>
        <label className="text-xs text-neutral-500">Ends<input type="time" className={`${input} mt-1`} value={e.end} onChange={(ev) => set("end", ev.target.value)} /></label>
        <label className="text-xs text-neutral-500">Time zone<select className={`${input} mt-1`} value={e.tz} onChange={(ev) => set("tz", ev.target.value)}>{[...new Set([e.tz, ...ZONES])].map((z) => <option key={z}>{z}</option>)}</select></label>
      </div>
      <p className="text-xs text-neutral-500">Times are clock times in that zone. An end before the start means it runs past midnight.</p>
      <div className="flex gap-3 text-xs"><label className="flex items-center gap-1"><input type="radio" checked={!oneOff} onChange={() => setOneOff(false)} /> Repeats weekly</label><label className="flex items-center gap-1"><input type="radio" checked={oneOff} onChange={() => setOneOff(true)} /> One day</label></div>
      {oneOff ? (
        <label className="block text-xs text-neutral-500">Date<input type="date" className={`${input} mt-1`} value={e.date ?? today} onChange={(ev) => set("date", ev.target.value)} /></label>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">{DAYS.map((d, i) => { const on = rule.days.includes(i); return <button key={d} type="button" aria-pressed={on} onClick={() => setRule({ days: on ? rule.days.filter((x) => x !== i) : [...rule.days, i].sort() })} className={`rounded-full border px-2.5 py-1 text-xs ${on ? "border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900" : "border-neutral-300 dark:border-neutral-700"}`}>{d}</button>; })}</div>
          <div className="grid grid-cols-3 gap-2">
            <label className="text-xs text-neutral-500">From<input type="date" className={`${input} mt-1`} value={rule.startDate} onChange={(ev) => setRule({ startDate: ev.target.value })} /></label>
            <label className="text-xs text-neutral-500">Until (optional)<input type="date" className={`${input} mt-1`} value={rule.until ?? ""} onChange={(ev) => setRule({ until: ev.target.value || undefined })} /></label>
            <label className="text-xs text-neutral-500">Every<select className={`${input} mt-1`} value={rule.everyWeeks ?? 1} onChange={(ev) => setRule({ everyWeeks: Number(ev.target.value) })}><option value={1}>week</option><option value={2}>2 weeks</option><option value={3}>3 weeks</option></select></label>
          </div>
        </>
      )}
      {e.kind === "shift" && (
        <div className="grid grid-cols-3 gap-2">
          <label className="text-xs text-neutral-500">Hourly pay<input type="number" min={0} step="0.25" className={`${input} mt-1`} value={e.hourly ?? 0} onChange={(ev) => set("hourly", Number(ev.target.value))} /></label>
          <label className="text-xs text-neutral-500">Employer<input className={`${input} mt-1`} value={e.employer ?? ""} placeholder={e.title || "Same as name"} onChange={(ev) => set("employer", ev.target.value || undefined)} /></label>
          <label className="text-xs text-neutral-500">Unpaid break (min)<input type="number" min={0} step={5} className={`${input} mt-1`} value={e.unpaidBreakMin ?? 0} onChange={(ev) => set("unpaidBreakMin", Number(ev.target.value))} /></label>
        </div>
      )}
      {error && <p role="alert" className="rounded-lg bg-red-500/10 p-2 text-xs text-red-800 dark:text-red-300">{error}</p>}
      <div className="flex gap-2"><button className={btn} onClick={save}>{initial ? "Save changes" : "Add"}</button><button className={btnGhost} onClick={onCancel}>Cancel</button></div>
    </div>
  );
}
