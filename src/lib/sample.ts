import type { EventDef, Settings } from "./types";

/** A made-up student with two employers and a remote side job. Not a real person. */
const NY = "America/New_York";
const term = { startDate: "2026-08-31", until: "2026-12-11" };

export const SAMPLE_EVENTS: EventDef[] = [
  { id: "calc", title: "Calculus II", kind: "class", tz: NY, start: "09:00", end: "09:50", rule: { days: [1, 3, 5], ...term } },
  { id: "ds", title: "Data Structures", kind: "class", tz: NY, start: "10:00", end: "11:15", rule: { days: [2, 4], ...term } },
  { id: "writing", title: "Writing", kind: "class", tz: NY, start: "13:00", end: "14:15", rule: { days: [1, 3], ...term } },
  { id: "library", title: "Library desk", kind: "shift", employer: "University Library", tz: NY, start: "11:00", end: "15:00", hourly: 15, unpaidBreakMin: 0, rule: { days: [2, 4], ...term } },
  { id: "depot-sat", title: "Warehouse", kind: "shift", employer: "Depot", tz: NY, start: "07:00", end: "15:00", hourly: 18, unpaidBreakMin: 30, breakAfterHours: 6, rule: { days: [6], ...term } },
  { id: "depot-sun", title: "Warehouse", kind: "shift", employer: "Depot", tz: NY, start: "07:00", end: "11:00", hourly: 18, rule: { days: [0], ...term } },
  { id: "stock", title: "Overnight stocking", kind: "shift", employer: "Depot", tz: NY, start: "22:00", end: "06:00", hourly: 20, rule: { days: [6], everyWeeks: 2, startDate: "2026-10-17", until: "2026-12-11" } },
  { id: "tutor", title: "Remote tutoring", kind: "shift", employer: "Brightpath", tz: "America/Los_Angeles", start: "17:00", end: "19:00", hourly: 22, rule: { days: [1, 3], ...term } },
];

export const DEFAULT_SETTINGS: Settings = {
  homeTz: NY, bufferMin: 30, weekStart: 0, overtimeAfterHours: 40, overtimeMultiplier: 1.5, monthlyTarget: 2800,
};

export const ZONES = ["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Phoenix", "America/Anchorage", "Pacific/Honolulu", "Europe/London", "Europe/Paris", "Asia/Kolkata", "Asia/Tokyo", "Australia/Sydney", "Pacific/Auckland", "America/Sao_Paulo", "UTC"];
