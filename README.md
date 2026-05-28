# TDSB permit space discovery notes

This repo documents the public/read-only HTTP surface behind the TDSB eBase permit site.

The useful discovery path is **not** permit submission. For scraping available facilities and spaces, the browser UI is backed by a small set of JSON-ish endpoints that currently work without authentication.

## Core endpoints

### 1. Space types available for a permit type

```http
GET /cu/api/space_types/fetch_available?permit_type_id=3
```

Returns a JSON array such as:

```json
[{"id":"18","name":"Gymnasium Single / General Purpose Room","request_by_qty":"0"}]
```

`permit_type_id=3` is `(B) Cost Recovery` in the current UI.

### 2. Facilities available for a permit type

```http
GET /cu/api/schools/search_available?is_admin=0&permit_type_id=3&user_id=0
```

Returns facility metadata: `id`, `name`, address fields, region, latitude, longitude, and facility hours.

### 3. Spaces at a facility

```http
POST /rentals/xhr/spaces/fetch
Content-Type: application/x-www-form-urlencoded

school_id=322&available_only=true
```

Returns a JSON array despite the `text/html` content type. Useful fields include:

- `id`
- `name`
- `space_type_id`
- `school_id`
- `type`
- `is_available`
- `hours`
- `hide_from_public`

### 4. Existing bookings for a facility or space

```http
GET /rentals/bookings/get?start_date=2026-05-01%2000:00:00&end_date=2026-05-07%2023:59:59&filters[filter_type]=facility&filters[school_id]=322&filters[space_id]=0
```

Use `filters[space_id]=0` for all spaces at a facility, or a concrete space id for one room.

The response includes booking windows (`start`, `end`), status, facility, and a display string in `spaces`.

### 5. Facility excluded dates / closures

```http
GET /cu/special_dates/get?start_date=2026-05-01%2000:00:00&end_date=2026-05-07%2023:59:59&school_id=322
```

Returns closures such as holidays and other excluded dates.

### 6. Spaces available at a facility for a specific date/time

```http
GET /cu/api/spaces/search_available?is_admin=0&permit_id=&permit_type_id=3&school_id=15&recurrence=0&start_date=May+27,+2026&start_time=7:00+PM&end_time=9:00+PM&useSpaceBlockStyle=false
```

This is the availability endpoint behind the live permit-booking UI (Step 2 of the create-permit flow). It works without authentication. Unlike `/rentals/xhr/spaces/fetch` (§3), it factors in the requested date/time and recurrence:

- `permit_type_id` — same ids as §1/§2.
- `school_id` — facility id from §2.
- `recurrence` — `0`=Single, `1`=Daily, `2`=Weekly, `3`=Bi-weekly, `4`=Monthly. For `0`, pass both `start_date` and `end_date`; for weekly/recurring, `end_date` is omitted and day-of-week is supplied separately by the UI.
- `start_date` — human format, e.g. `May 27, 2026` (URL-encoded).
- `start_time` / `end_time` — e.g. `7:00 PM` (omit to list all spaces regardless of time).

Returns a JSON array of `{id, name, description, space_type_id, type, attributes, pictures}`. Spaces that intersect an excluded date (§5) for the requested window include `"conflicts_ex_date": true`. An empty array means nothing is bookable at that facility/time (e.g. the whole window falls inside a closure).

## Practical scrape model

A scraper can build availability in four passes:

1. fetch permit-compatible space types
2. fetch permit-compatible facilities
3. fetch spaces per facility
4. fetch bookings + excluded dates for the date range you care about

From there, compute free intervals locally from:

- facility hours
- per-space hours where present
- excluded dates
- existing booking intervals

## Important caveats

- These endpoints are undocumented implementation details and may change.
- Some responses are JSON with a misleading `text/html` content type.
- `hide_from_public=1` appears on internal/non-public spaces and should generally be filtered out.
- A space being listed does not itself mean it is free at a requested time; you still need to subtract bookings and closures.
- The newer `/apiv2/cu/spaces/availability` endpoint exists in shared eBase JS, but currently redirects to a separate `/auth/login` flow from this rentals surface, so it is not the practical target here. For date/time-aware availability, use `/cu/api/spaces/search_available` (§6) instead — it is reachable anonymously.
- See `docs/permit-creation-flow.md` for the full member-side create-permit flow (the 5-step wizard) and the endpoints each step calls.

## Authenticated rentals access (Community Use)

For actions that require a logged-in Community Use member (e.g., submitting or viewing your own permit requests), the login form is at:

```http
GET /rentals/welcome
```

The "Existing users" panel posts `username` + `password` and, on success, redirects to `/rentals/permits` — the member's "My permits" dashboard (header shows e.g. `Member #0917`).

`/auth/login` is a **separate staff/admin login** with two options: TDSB SAML SSO (redirects to `login.microsoftonline.com`, requires a `@tdsb.on.ca` account) or an "eBASE credentials" form. Community Use member credentials are **not** valid on either of those — only at `/rentals/welcome`.

Credentials are read from env vars (not committed):

- `TDSB_USER_NAME` — the numeric member id (matches the `Member #…` displayed after login)
- `TDSB_PW`

These are not currently used by any code in this repo — the scrape endpoints above are all unauthenticated. They're documented here so authenticated flows added later have a consistent home.

## Quick start

See `tdsb_spaces.py` for a small client that lists facilities, spaces, bookings, and excluded dates with plain HTTP requests.

## Webapp implementation

This repo now includes a Next.js/Prisma webapp for searching cached TDSB availability data.

### Setup

```bash
npm install
cp .env.example .env.local
# set DATABASE_URL to a Postgres/Supabase database
npm run prisma:generate
npm run prisma:migrate
npm run sync:inventory
npm run sync:bookings
npm run dev
```

The search UI reads from the local database. The `/api/space-types` and `/api/facilities` endpoints fall back to live TDSB reads when the database has not been synced, but `/api/search` requires synced local data.

### Scripts

- `npm run sync:inventory` fetches facility, space type, and space inventory.
- `npm run sync:bookings` fetches bookings and excluded dates for the next `BOOKING_SYNC_DAYS` days.
- `START_DATE=2026-06-01 END_DATE=2026-08-31 npm run sync:bookings` syncs an explicit window.
- By default, booking sync refreshes successful facilities and leaves failed facilities' existing cache untouched. Set `STRICT_BOOKING_SYNC=1` to exit nonzero after partial failures.
- Production inventory is refreshed by `.github/workflows/sync-inventory.yml` weekly.
- Production bookings are refreshed by `.github/workflows/sync-bookings.yml` daily. Keep expected TDSB failures in `BOOKING_SYNC_EXCLUDED_FACILITY_IDS` so `STRICT_BOOKING_SYNC=1` only alerts on unexpected failures.
- If expected failures become too volatile to maintain as exclusions, run scheduled booking sync with `STRICT_BOOKING_SYNC=0` instead and monitor the printed failure summary.

### Analytics

GA4 is loaded via `@next/third-parties/google` when `NEXT_PUBLIC_GA_MEASUREMENT_ID` is set (set it in `.env.local` and Vercel project env). Pageviews fire automatically on route changes; custom events are emitted via `trackEvent` in `lib/analytics.ts`.

Currently tracked events:

- `search_initiated` — user runs a nearby search (`{ space_type_id }`)
- `space_type_selected` — user changes the space type filter (`{ space_type_id }`)
- `photo_gallery_opened` — user opens a space's photo gallery (`{ space_id, space_name, school_name }`)
- `permit_window_opened` — user opens the permit submission window modal
