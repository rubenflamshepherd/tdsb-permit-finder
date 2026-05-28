# Permit creation flow (Community Use member side)

Notes from manually traversing the "Create new permit request" wizard while logged in
as a Community Use member (`/rentals/welcome` login — see README "Authenticated rentals
access"). This documents the member-facing flow, not the staff/admin (`/cu/...`) UI.

The flow was traversed end-to-end **except the final submit at Step 5**, which would
file a real permit application. All drafts created during exploration were cancelled.

## URL pattern

```
/rentals/permits/add/{step_number}/{token}
```

- `GET /rentals/permits/add/1` generates a draft `token` and redirects to
  `/rentals/permits/add/1/<token>`.
- The same URL handles both render (`GET`) and submit (`POST`) for each step.
- `token` is stable across all five steps of a single draft (e.g. `6a1523b1a0983`).
- Editing an existing draft uses `/rentals/permits/edit/<token>`, which 302-redirects
  to `/rentals/permits/edit/<token>/<step>/<step_token>`.
- Every step's form has three submit buttons: `btnCancel`, `btnBack`, `btnNext`.
  `btnNext` advances (labelled "Submit" on Step 5); `btnCancel` discards the draft and
  returns to `/rentals/permits`.

A partially-completed draft shows up on the `/rentals/permits` dashboard until submitted
or cancelled.

## Step 1 — Event details

`POST /rentals/permits/add/1/<token>`

Form fields (a permit-type selection drives which `extra_*` blocks become required):

- `selPermitType`, `txtPurpose`, `txtAttendance`, `chkUnderAge`, `chkFoodAndBeverage`
- Permit-type-specific blocks, only some of which are required per type:
  - `extra_subsidy_*` — (A1/A2) Subsidy, (B) Cost Recovery, (C) Commercial Rates
    (~14 fields: Toronto-resident %, fundraising/sport flags, fees, revenue spend, …)
  - `extra_bus_driver_*` — School Bus Parking
  - `extra_psi_*` — Toronto Parks, Forestry & Recreation
  - `extra_lnsp_*` — TDSB LNSP
- Insurance: `selInsuranceSource`, `txtInsuranceCompany`, `txtPolicyNumber`,
  `txtPolicyExpire` (a `bootstrap-datepicker`; the value must be set through the picker
  UI, not by typing — a typed string fails validation).
- Questions: `chkQuestion1[]` (age groups), `chkQuestion3[]` (activity categories),
  `chkQuestion4[]` (target communities radio).

XHRs fired on render / interaction:

- `GET /rentals/xhr/permits/permit_type_info?permit_type_id={id}` — JSON
  `{id, name, description, description_public, …}`. Determines which `extra_*` block is
  required for the chosen type.
- `GET /rentals/permits/step1_equipment_list/<token>` — HTML fragment of currently
  attached equipment.
- `GET /rentals/permits/step1_equipment_choose/<token>` — HTML picker (modal target of
  the "Add" equipment link).
- `GET /rentals/api/files/show_in_permit` — JSON of account-level files the member must
  acknowledge.

Permit types and their numeric `permit_type_id` (from the dropdown):
`(A1) Highest Subsidy`, `(A2) Partial Subsidy`, `(B) Cost Recovery` = `3`,
`(C) Commercial Rates`, `Commercial Filming and Photography`,
`Government Elections` = `23`, `Lease Extension`, `MTCS After-School Program`,
`School Bus Parking`, `Swimming Pools`, `TDSB LNSP - Category A`,
`Toronto Parks, Forestry & Recreation`, `XOTO Commercial Filming and Photography`.

> Tip for testing: `Government Elections` has the fewest required extras (only insurance),
> so it's the quickest type to push a draft through.

## Step 2 — Manage bookings

`GET /rentals/permits/add/2/<token>` renders a bookings table (Cancel/Back/Next only).
Bookings are added through an Angular modal.

**Open the modal** ("Add booking(s)" button):

- `GET /rentals/permits/add_bookings/<token>` — modal HTML + form (Angular controller
  `CU-Permits-AddBookingsCtrl`, posts back to the same URL).
- The modal offers two paths: **Search** ("I need help finding available spaces") and
  **Build** ("I know exactly what space and time I'd like to request").

**On opening / using "Build", these fire:**

- `GET /cu/api/schools/search_available?is_admin=0&permit_type_id={N}&user_id=0`
  — facility list (README §2).
- `GET /cu/api/space_types/fetch_available?permit_type_id={N}` — space-type list
  (README §1).
- `GET /cu/api/spaces/search_available?...` — availability for the chosen
  facility/date/time/recurrence (README §6). Re-fires on each change of school, time, or
  recurrence. Response rows carry `conflicts_ex_date: true` when the slot intersects an
  excluded date.

Modal form fields: `bookingRecurrence` (Single/Daily/Weekly/Bi-weekly/Monthly),
`bookingStartDate`, `bookingEndDate`, `bookingDoW[]` ×7 (day-of-week for recurrence),
`bookingStartHour`/`bookingStartMin`/`bookingStartAMPM`, `bookingEnd*` equivalents,
`bookingSchool` (hidden), `search_state` (hidden). Submitting the modal POSTs to
`/rentals/permits/add_bookings/<token>` and returns to the Step 2 page with the booking
added under "Active bookings".

**Booking rows** in the table carry data attributes useful for DOM parsing:
`data-booking-start`, `data-booking-end`, `data-space-type-ids`, and
`data-booking-flags="N-N-N-..."` (one flag was `4` for an excluded-date conflict). A
conflicting row gets CSS class `bk-conflict`, and the page blocks advancing with
"All conflicts must be resolved before continuing".

**Removing a booking** (select row checkbox → "Actions" → "Remove selected bookings" →
"Apply"):

- `POST /rentals/permits/booking_actions/<token>?bookings_selected={bookingId}`

## Step 3 — Estimated costs

`GET /rentals/permits/add/3/<token>` — fully server-rendered, no XHRs. Shows a cost
breakdown (Rental fee → Sub-total → HST → Total) with Regular / Subsidy / After-subsidy
columns. Costs are estimates; the TDSB Permit Unit adds custodial/security fees on review.

## Step 4 — Additional information

`GET /rentals/permits/add/4/<token>`

XHRs:

- `GET /cu/api/custom_field_segments/find_all_with_fields?resource_type=permit` — JSON of
  admin-configured custom fields (e.g. a segment named "Additional Attendance").
- `GET /rentals/api/acknowledgements/required?acknowledge=permit&facilityIds={...}&isEbase=0&organizationTypeId={N}&permitTypeId={N}&spaceTypeIds={...}&userId={memberId}`
  — which file acknowledgements the user must complete before submitting. Returned `[]`
  for the test case.
- `GET /static/views/cu/files/acknowledge_files.html` — Angular template.

Form fields: event supervisors (an "Add" button opens its own picker), spectator count,
any custom-field segment inputs, and a "Special instructions" free-text box.

## Step 5 — Review and submit

`GET /rentals/permits/add/5/<token>` — read-only review of all prior steps. No new XHRs
beyond the standard `custom_field_segments` + `show_in_permit` + `account_files.html`.

**`POST /rentals/permits/add/5/<token>` with `btnNext` finalizes the permit application.**
(Not exercised during exploration.)

## Shared Angular templates loaded during the flow

- `/static/views/cu/permits/choose_school.html`
- `/static/views/cu/permits/choose_spaces.html`
- `/static/views/cu/permits/space_combination_info.html`
- `/static/views/cu/files/account_files.html`
- `/static/views/cu/files/acknowledge_files.html`

## Endpoint summary by step

| Step | Page | Key endpoints called |
|------|------|----------------------|
| 1 | Event details | `permit_type_info`, `step1_equipment_list/choose`, `files/show_in_permit` |
| 2 | Manage bookings | `add_bookings/<token>`, `schools/search_available`, `space_types/fetch_available`, `spaces/search_available`, `booking_actions/<token>` |
| 3 | Estimated costs | (server-rendered, none) |
| 4 | Additional info | `custom_field_segments/find_all_with_fields`, `acknowledgements/required` |
| 5 | Review & submit | (review only; POST `btnNext` submits) |
