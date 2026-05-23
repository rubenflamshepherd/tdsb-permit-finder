# Historical Booking Lookup — Implementation Plan

## Context

When a user searches for a permit slot at a TDSB facility, the schedule grid shows only forward-looking availability based on bookings in the upcoming sync window (`today → today + 180 days`). We want to enrich each slot with a signal showing whether **that specific space was booked at the equivalent calendar time in the previous two school years**, surfaced as a visual indicator on the slot cell.

This addresses two needs:
1. **Demand intelligence**: a slot that looks "available" today but was booked the last two years at this time is signalling likely future demand (recurring sports league, community group, etc.).
2. **Planning**: users can prefer slots that are historically uncontested.

**Feasibility confirmed**: The TDSB API endpoint `/rentals/bookings/get` (already wrapped by `TdsbClient.bookings` in `lib/tdsb-client.ts:131`) accepts arbitrary `start_date`/`end_date`. Historical bookings are available back to at least 2020 — verified against School 15 (Albert Campbell CI), which returned 50–139 bookings per week for every January from 2020–2026.

**Lookback window**: From the **Sept 1 that is two school years ago** through today. E.g., on 2026-05-23, the backfill covers `2023-09-01 → 2026-05-23`, giving two complete prior school years (2023-24, 2024-25) plus the elapsed portion of the current one (2025-26).

**Per-space matching strategy**: Booking rows already store the raw TDSB `spaces` text label as `Booking.spacesLabel` (`lib/sync.ts:176`), and `Space.name` holds the same string. We match historical bookings to a specific space at query time by string-comparing `booking.spacesLabel === space.name`, scoped to the same facility. **We do not need to populate `Booking.spaceId`** — the existing forward sync stores it as `null`, and the historical sync will do the same. This keeps the change minimal and leaves current search behaviour untouched.

**Match rule** when serving a search: recurring permits are weekly, so we compare like-for-like by **day of week**. For each candidate slot `(space, dateTime)`, look in the historical bookings for any row where `facilityId === space.facilityId`, `spacesLabel === space.name`, and the booking time overlaps the slot's time shifted back by exactly **52 weeks** (= 364 days) or exactly **104 weeks** (= 728 days).

A 52-week shift preserves day-of-week (Monday → Monday) and lands ~1 calendar day earlier than the same date a year prior, which is the correct behaviour for weekly recurring leagues, classes, etc. A calendar-year shift (`subYears`) would land on the wrong weekday and is the wrong primitive here.

For terminology in code and UI, we still describe the match in years (e.g., "booked last year") — the **52-week / 104-week shift is the mechanism**, "1 year" / "2 years" is the user-facing label.

---

## Architecture overview

Two independent areas of work:

1. **Historical backfill** — new lib function + script that fetches up to two school years of bookings and writes them to the existing `Booking` table. Forward sync gets one small adjustment so it stops wiping historical rows.
2. **Surface historical signal** in `/api/nearby` and the UI cell.

---

## Detailed changes

### 1. Historical backfill

**New file**: `scripts/sync-historical-bookings.ts` (mirror the 5-line pattern in `scripts/sync-bookings.ts`).

**New function**: `lib/sync.ts` → `syncHistoricalBookings(startDate?, endDate?, facilityIds?)`.

Behaviour:
- Default `startDate` = the current school-year start minus two years. In concrete terms: if today is before Sept 1, use `Sept 1` of `(currentYear - 3)`; otherwise use `Sept 1` of `(currentYear - 2)`. Default `endDate` = today.
- Iterate facilities (respecting `bookingSyncExcludedFacilityIds`).
- For each facility, call `client.bookings(facility.id, start, end, 0)` — same per-facility query the forward sync uses, just with a wider window.
- Map rows using the same logic at `lib/sync.ts:168-179`. `spaceId` stays `null`; `spacesLabel` is populated from `b.spaces`.
- **Do not** call `deleteMany()`. Use `prisma.booking.createMany({ data, skipDuplicates: true })` — same approach as `lib/sync.ts:191`. Since the row `id` is the TDSB booking id, duplicates between the forward and historical windows are naturally deduped.
- Add `package.json` script: `"sync:historical": "tsx scripts/sync-historical-bookings.ts"`.

**Forward sync compatibility**: The current `syncBookings` does `prisma.booking.deleteMany()` at line 190 — this would wipe historical rows on every forward sync. Scope the delete to the forward window:

```ts
prisma.booking.deleteMany({
  where: { startsAt: { gte: parseLocalDateTime(`${start} 00:00:00`) } },
});
```

This preserves any row whose `startsAt` is before the forward sync's `start`.

**Volume estimate**: ~500 facilities × ~50 bookings/wk × ~140 wks ≈ 3.5M rows worst case. Existing `[facilityId, startsAt, endsAt]` index is sufficient. No schema changes needed.

### 2. Historical signal in the API

**File**: `app/api/nearby/route.ts`.

Currently fetches bookings within `[rangeStart, rangeEnd]` (lines 53-67). Add a second query for the **historical windows**: for each year offset in `[1, 2]`, shift `rangeStart`/`rangeEnd` back by `52 * yearsBack` weeks and fetch bookings for the same `facilityIds`.

```ts
import { subWeeks } from "date-fns";

const historicalBookings = await prisma.booking.findMany({
  where: {
    facilityId: { in: facilityIds },
    OR: [1, 2].map((yearsBack) => ({
      startsAt: { lte: subWeeks(rangeEnd, 52 * yearsBack) },
      endsAt:   { gte: subWeeks(rangeStart, 52 * yearsBack) },
    })),
  },
});
```

Pass `historicalBookings` into `computeNearbySchedule` (next change).

### 3. Annotate slots with historical signal

**File**: `lib/nearby-slots.ts`.

Per the schedule computation at lines 85–130, `ScheduleSlot.weeks[]` already stores per-week `{ date, available }` (lines 9–16 type, populated at lines 105 and 115–122). Extend each entry to:

```ts
weeks: Array<{
  date: string;
  available: boolean;
  historicallyBookedYears: number[]; // e.g. [1, 2] = booked 1y AND 2y ago; [] = no history
}>
```

For each `{ space, slot, date }` triple produced by the existing logic at line 99–104, additionally check the new `historicalBookings` input for any booking where:
- `b.facilityId === space.facilityId`
- `b.spacesLabel === space.name` (the per-space match)
- For each `yearsBack ∈ [1, 2]`: does the booking overlap the slot's interval shifted back by `52 * yearsBack` weeks? Reuse `overlaps` from `lib/time.ts` after shifting the interval with `subWeeks(interval.start, 52 * yearsBack)` and the matching end.

Populate `historicallyBookedYears` with the set of offsets that matched (the **label** stays in years; the **shift** is in weeks).

**Why weeks, not years**: shifting by calendar years (`subYears`) would map Monday 2026-05-25 to Sunday 2025-05-25 — wrong weekday, so a Monday yoga class that ran weekly in 2025 wouldn't match a Monday search slot in 2026. A 52-week shift keeps day-of-week aligned, which is what recurring weekly permits demand.

**Edge case**: multi-space bookings have `spacesLabel` like `"Gym A, Cafeteria"` and won't match any single space's name exactly — they're correctly excluded from per-space historical matching, because we can't determine which of the listed spaces the searched space corresponds to.

### 4. Update API contract

**File**: `lib/api-contracts.ts`.

Extend the `ScheduleSlot.weeks` element shape (referenced from `NearbySchool.schedule` around lines 37–56) to include the new `historicallyBookedYears: number[]` field. If a Zod schema mirrors the response type, update it too.

### 5. Visual cell indicator

**Files**: `app/page.tsx` (the slot-cell render around lines 728–740), `app/globals.css`.

A cell represents one slot across all weeks of the search window. The cell is "historically contested" if **any** of its weeks has a non-empty `historicallyBookedYears`. For the first cut:

- Add a CSS class `slot-cell--historical` toggled when any week in the cell has `historicallyBookedYears.length > 0`.
- Style: small colored dot in a corner of the cell (e.g., a `::after` pseudo-element). Optionally a stronger variant `slot-cell--historical-both` for cells where any week has both offsets matched (`includes(1) && includes(2)`).
- Orthogonal to `slot.status` — a slot can be "available" *and* "historically booked" simultaneously; that's the whole point.

No tooltip changes (user opted for cell indicator only).

---

## Critical files

| File | Change |
|------|--------|
| `lib/sync.ts` | Add `syncHistoricalBookings`. Scope `syncBookings`'s `deleteMany` to the forward window. |
| `scripts/sync-historical-bookings.ts` | **New**. 5-line entry point mirroring `scripts/sync-bookings.ts`. |
| `package.json` | Add `sync:historical` script. |
| `lib/nearby-slots.ts` | Accept `historicalBookings` input; populate `historicallyBookedYears` per week. |
| `lib/api-contracts.ts` | Extend `ScheduleSlot.weeks` element type. |
| `app/api/nearby/route.ts` | Fetch historical bookings (1y, 2y back); pass through. |
| `app/page.tsx` | Toggle `slot-cell--historical` class on cells with historical overlap. |
| `app/globals.css` | Style for the new class. |

Existing utilities to reuse:
- `parseLocalDateTime` in `lib/sync.ts` for booking time parsing.
- `mapLimit` in `lib/sync.ts` for concurrency control in the backfill.
- `bookingSyncExcludedFacilityIds()` — apply the same exclusions to the historical sync.
- `overlaps` and `Interval` in `lib/time.ts` for interval comparison.
- `subWeeks` from `date-fns` for the 52/104-week historical shift (DST-safe, preserves day-of-week).

---

## Verification

Follow TDD per CLAUDE.md:

1. **Unit tests** in `test/nearby-slots.test.ts` (mirror existing pattern at lines 46–117). Pick a search slot that's a Monday (e.g., `2026-05-25 18:00`) so day-of-week assertions are unambiguous.
   - Slot has no historical bookings → `historicallyBookedYears === []`.
   - Booking with matching `spacesLabel` exactly 52 weeks before slot (Monday 2025-05-26 18:00) → `[1]`.
   - Bookings 52 weeks AND 104 weeks before (both Mondays, same time) → `[1, 2]`.
   - **Day-of-week guard**: booking on the calendar-anniversary date 2025-05-25 (which is a Sunday) at the same time → `[]`. This is the case the week-shift fix solves.
   - Booking 52 weeks before with **different** `spacesLabel` at the same facility → `[]`.
   - Booking at the right time but at a different facility → `[]`.
   - Booking with multi-space label (`"Gym A, Cafeteria"`) that includes the searched space name as a substring → `[]` (we only match on exact equality, by design).

2. **Manual end-to-end**:
   - Run `FACILITY_IDS=15 npm run sync:historical` for Albert Campbell CI (confirmed busy facility). Verify rows appear in `Booking` with `startsAt` going back to the appropriate Sept 1 and `spacesLabel` populated.
   - Start the dev server, search near Albert Campbell CI for a date in the next 30 days, and visually confirm at least some slot cells render the historical indicator. Inspect the `/api/nearby` network response to confirm `historicallyBookedYears` is populated and non-empty for the right cells.
   - Re-run `npm run sync:bookings` after the backfill and confirm historical rows are **not** wiped (the scoped `deleteMany` is the safeguard).

3. **Regression**: run `npm test`. Existing `nearby-slots.test.ts` cases that don't pass historical bookings should keep passing — the new field should default to `[]` and have no effect on existing assertions.

---

## Out of scope (deliberately, per YAGNI)

- Populating `Booking.spaceId`. The existing forward sync sets it to `null` and current `nearby-slots.ts` falls back to facility-level booking matching as a result. Changing this would alter existing search behaviour (a booking in Room 101 currently blocks Room 102 from looking available) — that's a separate, deliberate decision. Tracked in [issue #2](https://github.com/rubenflamshepherd/tdsb-permit-finder/issues/2).
- Tooltip text describing the historical booking (user opted for cell indicator only).
- Backfill scheduling / cron — one-time invocation is sufficient.
- Re-syncing past data periodically.
- Aggregate stats ("usually busy on Mondays").
- More than 2 years of lookback.
