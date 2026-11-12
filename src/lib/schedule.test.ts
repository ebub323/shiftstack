import { describe, expect, it } from "vitest";
import { SAMPLE_EVENTS, DEFAULT_SETTINGS } from "./sample";
import { earnings, expand, findConflicts, freeWindows, hoursNeeded, toIcs } from "./schedule";
import { addDays, dateOf, daysBetween, isValidTz, offsetMs, startOfWeek, timeOf, weekdayOf, zonedToUtc } from "./time";
import type { EventDef, Settings } from "./types";

const iso = (ms: number) => new Date(ms).toISOString().replace(".000", "");
const NY = "America/New_York";
const settings: Settings = { homeTz: NY, bufferMin: 30, weekStart: 0, overtimeAfterHours: 40, overtimeMultiplier: 1.5, monthlyTarget: 1200 };
const shift = (o: Partial<EventDef> & { id: string }): EventDef => ({ title: "Shift", kind: "shift", tz: NY, start: "09:00", end: "17:00", hourly: 10, ...o });
const klass = (o: Partial<EventDef> & { id: string }): EventDef => ({ title: "Class", kind: "class", tz: NY, start: "09:00", end: "10:00", ...o });

describe("zonedToUtc", () => {
  it("handles ordinary summer and winter time", () => {
    expect(iso(zonedToUtc("2026-07-04", "12:00", NY))).toBe("2026-07-04T16:00:00Z");   // EDT, UTC-4
    expect(iso(zonedToUtc("2026-01-15", "12:00", NY))).toBe("2026-01-15T17:00:00Z");   // EST, UTC-5
  });
  it("uses the first occurrence of a time that happens twice (clocks go back)", () => {
    expect(iso(zonedToUtc("2026-11-01", "01:30", NY))).toBe("2026-11-01T05:30:00Z");   // 01:30 EDT, not the second 01:30 EST
  });
  it("moves a time that never happens forward by the gap (clocks go forward)", () => {
    expect(iso(zonedToUtc("2027-03-14", "02:30", NY))).toBe("2027-03-14T07:30:00Z");   // 02:30 does not exist; 03:30 EDT
  });
  it("works in zones with half-hour offsets, no daylight saving, and the southern hemisphere", () => {
    expect(iso(zonedToUtc("2026-06-01", "09:00", "Asia/Kolkata"))).toBe("2026-06-01T03:30:00Z");
    expect(iso(zonedToUtc("2026-07-01", "09:00", "Europe/London"))).toBe("2026-07-01T08:00:00Z");   // BST
    expect(iso(zonedToUtc("2026-12-01", "09:00", "Europe/London"))).toBe("2026-12-01T09:00:00Z");
    expect(iso(zonedToUtc("2026-01-15", "12:00", "Australia/Sydney"))).toBe("2026-01-15T01:00:00Z"); // AEDT, UTC+11 in January
    expect(iso(zonedToUtc("2026-10-04", "02:30", "Australia/Sydney"))).toBe("2026-10-03T16:30:00Z"); // gap: lands at 03:30 AEDT
  });
  it("makes the fall-back day 25 hours long and the spring-forward day 23", () => {
    expect((zonedToUtc("2026-11-02", "00:00", NY) - zonedToUtc("2026-11-01", "00:00", NY)) / 3600_000).toBe(25);
    expect((zonedToUtc("2027-03-15", "00:00", NY) - zonedToUtc("2027-03-14", "00:00", NY)) / 3600_000).toBe(23);
  });
  it("reports the offset change across the transition", () => {
    expect(offsetMs(zonedToUtc("2026-11-01", "00:30", NY), NY) / 3600_000).toBe(-4);
    expect(offsetMs(zonedToUtc("2026-11-01", "12:00", NY), NY) / 3600_000).toBe(-5);
  });
  it("round-trips: the clock reads what was asked for, except in a gap", () => {
    const zones = ["America/New_York", "America/Los_Angeles", "Europe/London", "Asia/Kolkata", "Australia/Sydney", "Pacific/Auckland", "America/Sao_Paulo"];
    let checked = 0;
    for (const tz of zones) for (let day = 0; day < 400; day += 3) for (const t of ["00:00", "01:30", "02:30", "09:15", "23:45"]) {
      const date = addDays("2026-01-01", day);
      const ms = zonedToUtc(date, t, tz);
      const readDate = dateOf(ms, tz), readTime = timeOf(ms, tz);
      if (readDate === date && readTime === t) { checked++; continue; }
      // the only allowed miss is a gap, where the result is later than the request
      const asked = Date.UTC(...(date.split("-").map(Number) as [number, number, number]).map((v, i) => (i === 1 ? v - 1 : v)) as [number, number, number], ...t.split(":").map(Number) as [number, number]);
      const got = Date.UTC(...(readDate.split("-").map(Number) as [number, number, number]).map((v, i) => (i === 1 ? v - 1 : v)) as [number, number, number], ...readTime.split(":").map(Number) as [number, number]);
      expect(got).toBeGreaterThan(asked);
      expect(got - asked).toBeLessThanOrEqual(2 * 3600_000);
    }
    expect(checked).toBeGreaterThan(3000);
  });
});

describe("calendar dates", () => {
  it("adds days across months and leap years", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2027-02-28", 1)).toBe("2027-03-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
  it("knows the weekday and the start of the week", () => {
    expect(weekdayOf("2026-11-11")).toBe(3);                      // Wednesday
    expect(startOfWeek("2026-11-11", 0)).toBe("2026-11-08");       // Sunday
    expect(startOfWeek("2026-11-11", 1)).toBe("2026-11-09");       // Monday
    expect(daysBetween("2026-11-01", "2026-12-01")).toBe(30);
  });
  it("recognises real and fake zones", () => {
    expect(isValidTz("America/New_York")).toBe(true);
    expect(isValidTz("Mars/Olympus")).toBe(false);
  });
});

describe("expand", () => {
  it("repeats weekly on the chosen days, honours start, until and skipped dates", () => {
    const e = klass({ id: "c", rule: { days: [1, 3], startDate: "2026-11-02", until: "2026-11-18", except: ["2026-11-11"] } });
    const xs = expand([e], "2026-11-01", "2026-11-30", NY);
    expect(xs.map((x) => x.date)).toEqual(["2026-11-02", "2026-11-04", "2026-11-09", "2026-11-16", "2026-11-18"]);
  });
  it("supports every-other-week patterns", () => {
    const e = shift({ id: "s", rule: { days: [6], startDate: "2026-11-07", everyWeeks: 2 } });
    expect(expand([e], "2026-11-01", "2026-12-12", NY).map((x) => x.date)).toEqual(["2026-11-07", "2026-11-21", "2026-12-05"]);
  });
  it("places a one-off event on its date only", () => {
    const e = shift({ id: "o", date: "2026-11-12" });
    expect(expand([e], "2026-11-08", "2026-11-14", NY)).toHaveLength(1);
    expect(expand([e], "2026-11-15", "2026-11-21", NY)).toHaveLength(0);
  });
  it("keeps the wall-clock time steady across a clock change, so the instant shifts", () => {
    const e = klass({ id: "c", start: "09:00", end: "10:00", rule: { days: [5, 0], startDate: "2026-10-30" } });
    const xs = expand([e], "2026-10-30", "2026-11-02", NY);
    const fri = xs.find((x) => x.date === "2026-10-30")!, mon = expand([klass({ id: "c", rule: { days: [1], startDate: "2026-11-02" } })], "2026-11-02", "2026-11-02", NY)[0];
    expect(timeOf(fri.startMs, NY)).toBe("09:00");
    expect(timeOf(mon.startMs, NY)).toBe("09:00");
    expect(iso(fri.startMs)).toBe("2026-10-30T13:00:00Z");   // EDT
    expect(iso(mon.startMs)).toBe("2026-11-02T14:00:00Z");   // EST: the same wall time is an hour later in UTC
  });
  it("reads each event in its own zone and dates it in the viewer's zone", () => {
    const remote = shift({ id: "r", tz: "America/Los_Angeles", start: "17:00", end: "19:00", rule: { days: [1], startDate: "2026-11-02" } });
    const x = expand([remote], "2026-11-02", "2026-11-02", NY)[0];
    expect(timeOf(x.startMs, NY)).toBe("20:00");               // 5pm Pacific is 8pm Eastern
    const late = shift({ id: "l", tz: "America/Los_Angeles", start: "22:00", end: "23:30", rule: { days: [1], startDate: "2026-11-02" } });
    const y = expand([late], "2026-11-02", "2026-11-04", NY)[0];
    expect(y.date).toBe("2026-11-03");                          // 10pm Monday Pacific is 1am Tuesday Eastern
  });
  it("makes an overnight shift 9 hours when clocks go back and 7 when they go forward", () => {
    const night = shift({ id: "n", start: "22:00", end: "06:00", rule: { days: [5, 6], startDate: "2026-10-30" } });
    const fall = expand([night], "2026-10-30", "2026-11-01", NY);
    expect(fall.find((x) => x.date === "2026-10-30")!.minutes).toBe(480);
    const back = fall.find((x) => x.date === "2026-10-31")!;
    expect(back.minutes).toBe(540);
    expect(back.nominalMinutes).toBe(480);
    expect(back.dstShifted).toBe(true);
    const night2 = shift({ id: "n2", start: "22:00", end: "06:00", rule: { days: [6], startDate: "2027-03-13" } });
    const spring = expand([night2], "2027-03-13", "2027-03-14", NY)[0];
    expect(spring.minutes).toBe(420);
    expect(spring.dstShifted).toBe(true);
  });
  it("does not flag ordinary days", () => {
    const e = shift({ id: "p", rule: { days: [2], startDate: "2026-07-07" } });
    expect(expand([e], "2026-07-07", "2026-07-07", NY)[0].dstShifted).toBe(false);
  });
});

describe("findConflicts", () => {
  const inst = (events: EventDef[], from = "2026-11-09", to = "2026-11-15") => expand(events, from, to, NY);
  it("finds a true overlap and how long it is", () => {
    const xs = inst([klass({ id: "c", start: "10:00", end: "11:15", date: "2026-11-12" }), shift({ id: "s", start: "11:00", end: "15:00", date: "2026-11-12" })]);
    const c = findConflicts(xs, 30);
    expect(c).toHaveLength(1);
    expect(c[0].kind).toBe("overlap");
    expect(c[0].minutes).toBe(15);
  });
  it("flags a class and a shift that are too close, but not touching classes", () => {
    const close = inst([klass({ id: "c", start: "10:00", end: "11:00", date: "2026-11-12" }), shift({ id: "s", start: "11:10", end: "15:00", date: "2026-11-12" })]);
    const c = findConflicts(close, 30);
    expect(c).toHaveLength(1);
    expect(c[0].kind).toBe("tight");
    expect(c[0].minutes).toBe(20);
    const twoClasses = inst([klass({ id: "a", start: "10:00", end: "11:00", date: "2026-11-12" }), klass({ id: "b", start: "11:00", end: "12:00", date: "2026-11-12" })]);
    expect(findConflicts(twoClasses, 30)).toEqual([]);
  });
  it("leaves enough room alone", () => {
    const ok = inst([klass({ id: "c", start: "10:00", end: "11:00", date: "2026-11-12" }), shift({ id: "s", start: "11:45", end: "15:00", date: "2026-11-12" })]);
    expect(findConflicts(ok, 30)).toEqual([]);
  });
  it("sees conflicts across time zones", () => {
    const xs = inst([klass({ id: "c", start: "20:30", end: "21:30", date: "2026-11-12" }), shift({ id: "r", tz: "America/Los_Angeles", start: "17:00", end: "19:00", date: "2026-11-12" })]);
    expect(findConflicts(xs, 0)).toHaveLength(1);     // 5pm-7pm Pacific is 8pm-10pm Eastern
  });
});

describe("earnings", () => {
  const week = (events: EventDef[]) => earnings(expand(events, "2026-11-08", "2026-11-14", NY), settings);
  it("pays hours at the hourly rate", () => {
    const e = shift({ id: "a", hourly: 15, start: "12:00", end: "16:00", rule: { days: [2, 4], startDate: "2026-11-01" } });
    expect(week([e]).total).toBe(120);                                  // 8 hours x $15
  });
  it("takes an unpaid meal break out of long shifts only", () => {
    const long = shift({ id: "l", hourly: 20, start: "09:00", end: "17:00", unpaidBreakMin: 30, date: "2026-11-10" });
    const short = shift({ id: "s", hourly: 20, start: "09:00", end: "12:00", unpaidBreakMin: 30, date: "2026-11-11" });
    expect(week([long]).total).toBe(150);                               // 7.5 h
    expect(week([short]).total).toBe(60);                               // 3 h, no break taken
  });
  it("pays time and a half past 40 hours for ONE employer", () => {
    const e = shift({ id: "o", hourly: 10, start: "08:00", end: "17:00", unpaidBreakMin: 0, rule: { days: [1, 2, 3, 4, 5], startDate: "2026-11-01" } });
    const w = week([e]);                                                // 5 x 9h = 45h
    expect(w.weeks[0].hours).toBe(45);
    expect(w.weeks[0].overtimeHours).toBe(5);
    expect(w.total).toBe(475);                                          // 45 x 10 + 5 x 10 x 0.5
  });
  it("does not combine hours across two employers", () => {
    const a = shift({ id: "a", employer: "Cafe", hourly: 10, start: "08:00", end: "14:00", unpaidBreakMin: 0, rule: { days: [1, 2, 3, 4, 5], startDate: "2026-11-01" } });
    const b = shift({ id: "b", employer: "Store", hourly: 10, start: "15:00", end: "21:00", unpaidBreakMin: 0, rule: { days: [1, 2, 3, 4, 5], startDate: "2026-11-01" } });
    const w = week([a, b]);                                             // 30h + 30h
    expect(w.weeks[0].overtimeHours).toBe(0);
    expect(w.total).toBe(600);
  });
  it("pays the 9-hour night when clocks go back, and counts a shift in the week it starts", () => {
    const night = shift({ id: "n", hourly: 20, start: "22:00", end: "06:00", unpaidBreakMin: 0, date: "2026-10-31" });
    const w = earnings(expand([night], "2026-10-25", "2026-11-07", NY), settings);
    expect(w.total).toBe(180);                                          // 9 h, not 8
    expect(w.weeks).toHaveLength(1);
    expect(w.weeks[0].weekStart).toBe("2026-10-25");
  });
  it("ignores classes and reports hours", () => {
    expect(week([klass({ id: "c", rule: { days: [1], startDate: "2026-11-01" } })])).toMatchObject({ total: 0, hours: 0 });
  });
  it("works out hours needed for a target", () => {
    expect(hoursNeeded(1200, 15)).toBe(80);
    expect(hoursNeeded(1200, 0)).toBe(Infinity);
  });
});

describe("freeWindows", () => {
  it("finds the gaps after leaving travel room, and drops ones that are too short", () => {
    const xs = expand([klass({ id: "c", start: "09:00", end: "10:00", date: "2026-11-12" }), shift({ id: "s", start: "13:00", end: "17:00", date: "2026-11-12" })], "2026-11-12", "2026-11-12", NY);
    const w = freeWindows(xs, "2026-11-12", "2026-11-12", NY, { dayStart: "08:00", dayEnd: "22:00", minMinutes: 60, bufferMin: 30 });
    expect(w.map((x) => [timeOf(x.startMs, NY), timeOf(x.endMs, NY), x.minutes])).toEqual([["10:30", "12:30", 120], ["17:30", "22:00", 270]]);
  });
  it("returns the whole day when nothing is scheduled", () => {
    const w = freeWindows([], "2026-11-12", "2026-11-12", NY, { dayStart: "08:00", dayEnd: "22:00", minMinutes: 60, bufferMin: 30 });
    expect(w).toHaveLength(1);
    expect(w[0].minutes).toBe(840);
  });
});

describe("toIcs", () => {
  it("writes one VEVENT per instance in UTC with CRLF line endings", () => {
    const xs = expand([klass({ id: "c", rule: { days: [1, 3], startDate: "2026-11-02" } })], "2026-11-02", "2026-11-08", NY);
    const ics = toIcs(xs, "My term");
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(xs.length);
    expect(ics).toContain("DTSTART:20261102T140000Z");
    expect(ics).toContain("X-WR-CALNAME:My term");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics.split("\r\n").every((l) => !l.includes("\n"))).toBe(true);
  });
  it("escapes characters that would break a line", () => {
    const title = String.raw`Calc, Sec 2; room\4`;
    const ics = toIcs(expand([klass({ id: "c", title, date: "2026-11-12" })], "2026-11-12", "2026-11-12", NY), "x");
    expect(ics).toContain(String.raw`SUMMARY:Calc\, Sec 2\; room\\4`);   // RFC 5545: escape comma, semicolon and backslash
  });
});

// ---------------------------------------------------------------- properties
function rng(seed: number) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

describe("invariants over 200 random schedules", () => {
  const r = rng(77);
  const zones = ["America/New_York", "America/Los_Angeles", "Europe/London", "Asia/Kolkata", "Australia/Sydney", "America/Sao_Paulo"];
  const times = ["06:00", "08:30", "09:15", "12:00", "17:00", "22:00", "23:30"];
  for (let n = 0; n < 200; n++) {
    const tz = zones[Math.floor(r() * zones.length)];
    const start = times[Math.floor(r() * times.length)], end = times[Math.floor(r() * times.length)];
    const days = [0, 1, 2, 3, 4, 5, 6].filter(() => r() > 0.55);
    const startDate = addDays("2026-09-01", Math.floor(r() * 200));
    const e: EventDef = { id: `e${n}`, title: "T", kind: "shift", tz, start, end, hourly: 12, rule: { days: days.length ? days : [1], startDate, everyWeeks: r() > 0.7 ? 2 : 1 } };
    it(`holds for random schedule ${n}`, () => {
      const from = addDays(startDate, -3), to = addDays(startDate, 60);
      const xs = expand([e], from, to, "America/New_York");
      for (const x of xs) {
        expect(x.endMs).toBeGreaterThan(x.startMs);
        const nominal = ((end <= start ? 1440 : 0) + (Number(end.slice(0, 2)) * 60 + Number(end.slice(3)) - Number(start.slice(0, 2)) * 60 - Number(start.slice(3))));
        expect(Math.abs(x.minutes - nominal)).toBeLessThanOrEqual(120);          // a clock change moves it by an hour (or two at most)
        expect(x.dstShifted).toBe(x.minutes !== nominal);
        expect(weekdayOf(dateOf(x.startMs, tz))).toBeGreaterThanOrEqual(0);
      }
      // sorted, and one event never overlaps itself
      for (let i = 1; i < xs.length; i++) { expect(xs[i].startMs).toBeGreaterThanOrEqual(xs[i - 1].startMs); expect(xs[i].startMs).toBeGreaterThanOrEqual(xs[i - 1].endMs - 3 * 3600_000 * 0 - 24 * 3600_000); }
      expect(findConflicts(xs, 0).filter((c) => c.a.eventId === c.b.eventId && c.kind === "overlap" && c.a.startMs === c.b.startMs)).toEqual([]);
      // pay is never negative and never exceeds hours x rate x overtime multiplier
      const pay = earnings(xs, settings);
      expect(pay.total).toBeGreaterThanOrEqual(0);
      expect(pay.total).toBeLessThanOrEqual(pay.hours * 12 * 1.5 + 0.01);
    });
  }
});

describe("the bundled sample", () => {
  it("includes a shift that lands on the night the clocks go back, so the demo shows the real effect", () => {
    const xs = expand(SAMPLE_EVENTS, "2026-10-25", "2026-11-07", DEFAULT_SETTINGS.homeTz);
    const night = xs.filter((x) => x.dstShifted);
    expect(night).toHaveLength(1);
    expect(night[0].minutes).toBe(540);
    expect(night[0].nominalMinutes).toBe(480);
  });
  it("includes at least one real conflict and one cross-zone shift", () => {
    const xs = expand(SAMPLE_EVENTS, "2026-11-08", "2026-11-14", DEFAULT_SETTINGS.homeTz);
    expect(findConflicts(xs, DEFAULT_SETTINGS.bufferMin).some((c) => c.kind === "overlap")).toBe(true);
    expect(SAMPLE_EVENTS.some((e) => e.tz !== DEFAULT_SETTINGS.homeTz)).toBe(true);
  });
  it("is valid input: every zone is real and every shift has pay", () => {
    for (const e of SAMPLE_EVENTS) { expect(isValidTz(e.tz)).toBe(true); if (e.kind === "shift") expect(e.hourly).toBeGreaterThan(0); }
  });
});
