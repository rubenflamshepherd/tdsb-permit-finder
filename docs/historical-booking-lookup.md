# Historical Booking Lookup — Implementation Plan

## Context

When a user searches for a permit slot at a TDSB facility, the schedule grid shows only forward-looking availability based on bookings in the upcoming sync window (`today → today + 180 days`). We want to enrich each slot with a signal showing whether **a specific space was booked at the equivalent calendar time in the previous two school years**, surfaced as a visual indicator on the slot cell when that historically booked space is one of the spaces making the aggregate cell available.

This addresses two needs:
1. **Demand intelligence**: a slot that looks "available" today but was booked the last two years at this time is signalling likely future demand (recurring sports league, community group, etc.).
2. **Planning**: users can prefer slots that are historically uncontested.

**Feasibility confirmed**: The TDSB API endpoint `/rentals/bookings/get` (already wrapped by `TdsbClient.bookings` in `lib/tdsb-client.ts:131`) accepts arbitrary `start_date`/`end_date`. Historical bookings are available back to at least 2020 — verified against School 15 (Albert Campbell CI), which returned 50–139 bookings per week for every January from 2020–2026.

**Lookback window**: From the **Sept 1 that is two school years ago** through today. E.g., on 2026-05-23, the backfill covers `2023-09-01 → 2026-05-23`, giving two complete prior school years (2023-24, 2024-25) plus the elapsed portion of the current one (2025-26).

**Per-space matching strategy**: Booking rows now store `Booking.spaceIds: Int[]` (resolved at sync time by `resolveBookingSpaceIds` in `lib/sync.ts:21` from the raw TDSB `spaces` label against the facility's space names). The raw label is also kept in `Booking.spacesLabel`. The historical sync will populate `spaceIds` the same way the forward sync does (`lib/sync.ts:203`). Per-space matching at query time uses the same rule both the forward search (`lib/nearby-slots.ts:102`) and `availability.ts:54` already use: `b.spaceIds.includes(space.id)` when `spaceIds.length > 0`, with a facility-level fallback (`b.facilityId === space.facilityId`) when `spaceIds` is empty (i.e., the label couldn't be resolved to any known space). Multi-space bookings (e.g. `"Gym A, Cafeteria"`) resolve to multiple ids and correctly block every listed space.

**Match rule** when serving a search: recurring permits are weekly, so we compare like-for-like by **day of week**. For each candidate slot `(space, dateTime)`, look in the historical bookings for any row where (a) the per-space match holds — `b.spaceIds.includes(space.id)`, or facility-level fallback when `spaceIds` is empty — and (b) the booking time overlaps the slot's time shifted back by exactly **52 weeks** (= 364 days) or exactly **104 weeks** (= 728 days).

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
- Build the same `spaceMap` the forward sync builds (`lib/sync.ts:187-198`) and map rows using the same logic at `lib/sync.ts:200-211`: populate `spaceIds` via `resolveBookingSpaceIds(facilityId, b.spaces, spaceMap)` and `spacesLabel` from `b.spaces`. Bookings whose label can't be resolved end up with `spaceIds: []`, matching forward-sync behaviour, and the per-space matcher's facility-level fallback applies.
- **Do not** call `deleteMany()`. Use `prisma.booking.createMany({ data, skipDuplicates: true })` — same approach as `lib/sync.ts:227`. Since the row `id` is the TDSB booking id, duplicates between the forward and historical windows are naturally deduped.
- Add `package.json` script: `"sync:historical": "tsx scripts/sync-historical-bookings.ts"`.

**Forward sync compatibility**: The current `syncBookings` does `prisma.booking.deleteMany()` at `lib/sync.ts:226` — this would wipe historical rows on every forward sync. Scope the delete to the forward window:

```ts
prisma.booking.deleteMany({
  where: { startsAt: { gte: parseLocalDateTime(`${start} 00:00:00`) } },
});
```

This preserves any row whose `startsAt` is before the forward sync's `start`.

**Inventory sync compatibility**: `syncInventory` currently runs a destructive rebuild at `lib/sync.ts:158`:

```ts
await prisma.$transaction([
  prisma.booking.deleteMany(),
  prisma.specialDate.deleteMany(),
  prisma.space.deleteMany(),
  prisma.facility.deleteMany(),
  prisma.spaceType.deleteMany(),
]);
```

This is not safe once historical rows exist. Even if the explicit `booking.deleteMany()` is removed, deleting `Facility` rows will still delete bookings through the `Booking.facility` relation's `onDelete: Cascade`.

Change inventory sync to preserve existing booking rows:

- Remove `prisma.booking.deleteMany()` from `syncInventory`.
- Do **not** delete `Facility` rows as part of inventory refresh, because that cascades into `Booking`.
- Replace the destructive facility/space/space-type rebuild with id-based upserts for `SpaceType`, `Facility`, and `Space` rows. Each upsert should refresh the same fields currently written by `createMany` (`rawJson`, `lastSyncedAt`, hours, pictures, etc.).
- For the first cut, leave stale inventory rows in place rather than deleting them. Stale facilities/spaces are lower risk than silently wiping historical booking data; stale cleanup can be a separate, explicit task if needed.
- `SpecialDate` rows are not historical data in this plan and can continue to be refreshed by `syncBookings`, but inventory sync should not delete them as a side effect.

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

### 3. Annotate slots with per-space historical signal

**File**: `lib/nearby-slots.ts`.

Per the schedule computation at lines 85–130, `ScheduleSlot.weeks[]` already stores per-week aggregate `{ date, available }` (lines 9–16 type, populated at lines 105 and 115–122). Preserve that aggregate meaning, but add per-space detail so the historical signal does not get flattened across unrelated sibling spaces:

```ts
weeks: Array<{
  date: string;
  available: boolean; // aggregate: at least one candidate space is available
  spaces: Array<{
    spaceId: number;
    available: boolean;
    historicallyBookedYears: number[]; // e.g. [1, 2] = booked 1y AND 2y ago; [] = no history
  }>;
}>
```

Refactor the current `input.spaces.some(...)` availability calculation so each `{ space, slot, date }` triple first produces a per-space record:

- `available`: the existing special-date / hours / booking checks for that specific space.
- `historicallyBookedYears`: the historical offsets matched for that same specific space.

Then derive the existing aggregate values from the per-space records:

- `week.available = week.spaces.some((space) => space.available)`
- `slot.availableWeeks = weeks.filter((week) => week.available).length`
- `slot.status = statusFromCounts(availableWeeks, input.weeks)`

When checking the new `historicalBookings` input, reuse the exact per-space predicate already on `lib/nearby-slots.ts:102`:

```ts
const historicalForSpace = input.historicalBookings.filter((b) =>
  b.spaceIds.length > 0 ? b.spaceIds.includes(space.id) : b.facilityId === space.facilityId
);
```

For each such booking, for each `yearsBack ∈ [1, 2]`: does the booking overlap the slot's interval shifted back by `52 * yearsBack` weeks? Reuse `overlaps` from `lib/time.ts` after shifting the interval with `subWeeks(interval.start, 52 * yearsBack)` and the matching end.

Populate `historicallyBookedYears` with the set of offsets that matched (the **label** stays in years; the **shift** is in weeks).

Do **not** put a single `historicallyBookedYears` field directly on the aggregate week. A nearby schedule cell can be available because Gym B is free while Gym A has historical demand. Flattening history to the cell level would mark the cell as historically contested for the wrong space. The API should preserve the per-space fact and let the UI derive whichever aggregate indicator it needs.

**Why weeks, not years**: shifting by calendar years (`subYears`) would map Monday 2026-05-25 to Sunday 2025-05-25 — wrong weekday, so a Monday yoga class that ran weekly in 2025 wouldn't match a Monday search slot in 2026. A 52-week shift keeps day-of-week aligned, which is what recurring weekly permits demand.

**Multi-space bookings**: with `Booking.spaceIds` now populated by `resolveBookingSpaceIds`, a booking with label `"Gym A, Cafeteria"` resolves to `spaceIds: [gymAId, cafeteriaId]` and correctly contributes to the historical signal for **both** spaces. Bookings whose label couldn't be resolved (`spaceIds: []`) fall back to facility-level matching, matching forward-search semantics — slightly noisier but consistent with how the live search treats the same bookings.

### 4. Update API contract

**File**: `lib/api-contracts.ts`.

Extend the `ScheduleSlot.weeks` element shape (referenced from `NearbySchool.schedule` around lines 37–56) to include the new `spaces[]` array with `{ spaceId, available, historicallyBookedYears }`. If a Zod schema mirrors the response type, update it too.

### 5. Visual cell indicator

**Files**: `app/page.tsx` (the slot-cell render around lines 728–740), `app/globals.css`.

A cell represents one slot across all weeks of the search window and may aggregate multiple spaces at the same facility. The cell is "historically contested" only if the historical signal belongs to a space that is actually contributing availability to that aggregate cell:

```ts
const hasHistoricalAvailableSpace = slot.weeks.some((week) =>
  week.spaces.some((space) => space.available && space.historicallyBookedYears.length > 0)
);
```

For the first cut:

- Add a CSS class `slot-cell--historical` toggled by `hasHistoricalAvailableSpace`.
- Style: small colored dot in a corner of the cell (e.g., a `::after` pseudo-element). Optionally a stronger variant `slot-cell--historical-both` for cells where any available per-space week has both offsets matched (`includes(1) && includes(2)`).
- Orthogonal to `slot.status` — a slot can be "available" *and* "historically booked" simultaneously; that's the whole point.

No tooltip changes (user opted for cell indicator only).

---

## Critical files

| File | Change |
|------|--------|
| `lib/sync.ts` | Add `syncHistoricalBookings`. Scope `syncBookings`'s `deleteMany` to the forward window. Change `syncInventory` from destructive rebuild to id-based upserts so it preserves booking rows. |
| `scripts/sync-historical-bookings.ts` | **New**. 5-line entry point mirroring `scripts/sync-bookings.ts`. |
| `package.json` | Add `sync:historical` script. |
| `lib/nearby-slots.ts` | Accept `historicalBookings` input; populate per-space availability and `historicallyBookedYears` under each week. |
| `lib/api-contracts.ts` | Extend `ScheduleSlot.weeks` element type with per-space detail. |
| `app/api/nearby/route.ts` | Fetch historical bookings (1y, 2y back); pass through. |
| `app/page.tsx` | Toggle `slot-cell--historical` class when an available per-space week has historical overlap. |
| `app/globals.css` | Style for the new class. |

Existing utilities to reuse:
- `parseLocalDateTime` in `lib/sync.ts` for booking time parsing.
- `mapLimit` in `lib/sync.ts` for concurrency control in the backfill.
- `bookingSyncExcludedFacilityIds()` — apply the same exclusions to the historical sync.
- `resolveBookingSpaceIds` (`lib/sync.ts:21`) for resolving `spaces` label → `spaceIds[]` at historical sync time.
- `overlaps` and `Interval` in `lib/time.ts` for interval comparison.
- `subWeeks` from `date-fns` for the 52/104-week historical shift (DST-safe, preserves day-of-week).

---

## Verification

Follow TDD per CLAUDE.md:

1. **Unit tests** in `test/nearby-slots.test.ts` (mirror existing pattern at lines 46–117). Pick a search slot that's a Monday (e.g., `2026-05-25 18:00`) so day-of-week assertions are unambiguous.
   - Slot has no historical bookings → the searched space record has `historicallyBookedYears === []`.
   - Booking with `spaceIds: [searchedSpaceId]` exactly 52 weeks before slot (Monday 2025-05-26 18:00) → searched space record has `[1]`.
   - Bookings 52 weeks AND 104 weeks before (both Mondays, same time, both with the searched space id in `spaceIds`) → searched space record has `[1, 2]`.
   - **Day-of-week guard**: booking on the calendar-anniversary date 2025-05-25 (which is a Sunday) at the same time → searched space record has `[]`. This is the case the week-shift fix solves.
   - Booking 52 weeks before at the same facility but with `spaceIds: [otherSpaceId]` (not the searched space) → searched space record has `[]`.
   - Booking 52 weeks before with `spaceIds: []` (unresolved label) at the same facility → searched space record has `[1]` via the facility-level fallback. This documents that the historical signal inherits the live search's fallback behaviour.
   - Multi-space booking 52 weeks before with `spaceIds: [searchedSpaceId, otherSpaceId]` (label like `"Gym A, Cafeteria"`) → both listed space records get `[1]` — multi-space is properly resolved and contributes to the signal for each listed space.
   - Booking at the right time but at a different facility → searched space record has `[]`.
   - Aggregation guard: with two spaces, Gym A historically booked but unavailable in the searched week, Gym B available and historically uncontested → aggregate `week.available === true`, but the cell-level UI helper should return **not historical** because the historical signal is not attached to the available space.

2. **Manual end-to-end**:
   - Run `FACILITY_IDS=15 npm run sync:historical` for Albert Campbell CI (confirmed busy facility). Verify rows appear in `Booking` with `startsAt` going back to the appropriate Sept 1, `spacesLabel` populated, and the same `spaceIds`-resolution ratio (`N single + M multi-space = X/Y`) as the forward sync logs at `lib/sync.ts:215`.
   - Start the dev server, search near Albert Campbell CI for a date in the next 30 days, and visually confirm at least some slot cells render the historical indicator. Inspect the `/api/nearby` network response to confirm per-space `weeks[].spaces[].historicallyBookedYears` is populated and non-empty for the right cells.
   - Re-run `npm run sync:bookings` after the backfill and confirm historical rows are **not** wiped (the scoped `deleteMany` is the safeguard).
   - Re-run `npm run sync:inventory` after the backfill and confirm historical `Booking` rows are **not** wiped. This specifically verifies that inventory sync no longer deletes bookings directly or indirectly through facility cascade deletes.

3. **Regression**: run `npm test`. Existing `nearby-slots.test.ts` cases that don't pass historical bookings should keep the same aggregate availability/status expectations. Any exact `weeks` shape assertions should be updated for the new per-space detail, with each space's `historicallyBookedYears` defaulting to `[]`.

---

## Out of scope (deliberately, per YAGNI)

- ~~Populating `Booking.spaceId`.~~ **Already done as part of [issue #2](https://github.com/rubenflamshepherd/tdsb-permit-finder/issues/2)**: `Booking.spaceIds: Int[]` is now resolved at sync time by `resolveBookingSpaceIds` (`lib/sync.ts:21`), and the per-space matcher in `lib/nearby-slots.ts:102` uses it with a facility-level fallback when the array is empty. The historical sync inherits the same resolution for free.
- Tooltip text describing the historical booking (user opted for cell indicator only).
- Backfill scheduling / cron — one-time invocation is sufficient.
- Re-syncing past data periodically.
- Aggregate stats ("usually busy on Mondays").
- More than 2 years of lookback.
