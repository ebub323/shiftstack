/**
 * ShiftStack reconciles a work schedule with a class schedule. Times are wall-clock
 * times in a named time zone ("America/New_York"), never fixed offsets, because the
 * hard part of recurring events is that the offset changes twice a year.
 */
export type Kind = "class" | "shift" | "other";

export interface Rule {
  /** 0 = Sunday ... 6 = Saturday, read in the event's own time zone. */
  days: number[];
  /** First date the rule can produce, YYYY-MM-DD. */
  startDate: string;
  /** Last date, inclusive. */
  until?: string;
  /** 1 = every week, 2 = every other week. */
  everyWeeks?: number;
  /** Dates to skip (a holiday, a cancelled class). */
  except?: string[];
}

export interface EventDef {
  id: string;
  title: string;
  kind: Kind;
  tz: string;
  /** Wall-clock start and end, "HH:mm". An end at or before the start means the next day. */
  start: string;
  end: string;
  /** Repeats weekly, or happens once on `date`. */
  rule?: Rule;
  date?: string;
  /** Pay, for shifts. */
  hourly?: number;
  /** Who pays. Overtime is counted per employer. Defaults to the title. */
  employer?: string;
  /** An unpaid meal break taken out of shifts at least `breakAfterHours` long. */
  unpaidBreakMin?: number;
  breakAfterHours?: number;
}

export interface Instance {
  eventId: string;
  title: string;
  kind: Kind;
  startMs: number;
  endMs: number;
  /** The date the event starts, in the viewer's time zone. */
  date: string;
  minutes: number;
  paidMinutes: number;
  hourly: number;
  employer: string;
  /** Longer or shorter than the clock times suggest because a clock change fell inside it. */
  dstShifted: boolean;
  /** The length the clock times alone suggest, ignoring any clock change. */
  nominalMinutes: number;
}

export interface Conflict {
  a: Instance;
  b: Instance;
  kind: "overlap" | "tight";
  /** Minutes of overlap, or minutes short of the travel buffer. */
  minutes: number;
}

export interface Settings {
  homeTz: string;
  /** Travel time wanted between a class and a shift. */
  bufferMin: number;
  /** 0 = Sunday. The pay week, for overtime. */
  weekStart: number;
  overtimeAfterHours: number;
  overtimeMultiplier: number;
  monthlyTarget: number;
}

export interface WeekTotal { weekStart: string; hours: number; overtimeHours: number; pay: number }
export interface Earnings { weeks: WeekTotal[]; total: number; hours: number }
export interface Window { date: string; startMs: number; endMs: number; minutes: number }
