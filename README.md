# ShiftStack

**Classes and shifts, without the collisions.**

A planner for students who work. It shows conflicts between a class schedule and a work schedule
before they happen, what you will really earn (unpaid breaks and overtime included), and when you are
free. The hard part, and the reason it exists, is **time**: recurring events across time zones and
daylight-saving changes.

## The problem it solves correctly

A recurring event is a **wall-clock time in a named zone**, not a fixed UTC offset. That one decision
makes the rest fall out:

- A 9am class stays at 9am when the clocks change. In UTC it moves by an hour.
- A 10pm to 6am shift is **9 hours** the night clocks go back and **7** the night they go forward.
  That changes the pay, and the app shows it ("runs 9h instead of 8h").
- 5pm Pacific is 8pm Eastern, and 10pm Monday Pacific is *Tuesday* 1am Eastern, so each event is
  generated in its own zone and dated in yours.
- A time that happens twice (01:30 when clocks go back) resolves to the first; a time that never
  happens (02:30 when they go forward) moves forward by the gap.

## What it does

| | |
| --- | --- |
| **Week view** | A calendar that splits a shift crossing midnight across both days and opens up to the early hours when something happens there. Scrolls inside itself on a phone. |
| **Conflicts** | A hard overlap, or a class and a shift closer together than your travel time. Classes back to back are fine. Looks 8 weeks ahead. |
| **Earnings** | Weekly pay with unpaid breaks removed from long shifts and **overtime counted per employer** (overtime follows the employer, not the person). Shows the gap to a monthly target and the hours needed to close it. |
| **Free windows** | Stretches of 90 minutes or more once the travel buffer is left around everything. |
| **Calendar export** | The next 8 weeks as concrete UTC events in an `.ics` file, so any calendar app shows them at the right local time. |
| **Save and load** | Validated JSON, so a damaged file cannot overwrite a schedule. |

## Why the engine is trustworthy

- The time conversion is tested against **real daylight-saving facts**: the ambiguous 01:30 on the
  night clocks go back, the nonexistent 02:30 on spring-forward, a half-hour zone (Kolkata), and the
  southern hemisphere (Sydney, where the change is in October).
- The fall-back day is checked to be exactly 25 hours long and spring-forward day 23.
- A **round-trip property test** converts times in 7 zones across 400 days and checks the clock reads
  what was asked for, with a gap being the only permitted miss.
- **200 random schedules** across 6 zones check that every instance has a positive length, is within
  two hours of its nominal length, never overlaps itself, and that pay is never negative or above the
  overtime ceiling.
- The exported calendar was read back and checked: the clock-change shift is `02:00Z` to `11:00Z`
  (exactly 9 hours) and an ordinary one is 8.
- The bundled sample is itself tested to contain a clock-change night and a real conflict, so the demo
  cannot quietly stop demonstrating the point.

## Limits

Overtime is counted per employer over a fixed pay week at the multiplier you set. Whether you are
owed it, and at what threshold, depends on where you work, so check your own rules. Recurrence is
weekly (every 1, 2 or 3 weeks); there is no monthly rule. The app's own data is invented sample data.

## Run it

```bash
npm install
npm run dev     # http://localhost:3000
npm test        # 235 tests
npm run build   # static export to out/
```

## Stack

Next.js 16 (static export) · TypeScript · Tailwind v4 · the platform `Intl` time-zone database
(no date library) · Vitest · GitHub Actions
