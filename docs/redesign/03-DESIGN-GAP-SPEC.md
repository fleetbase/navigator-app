# Navigator Redesign — Design Round 2 Brief

> Round 1 delivered the **Waypoint** design system and 19 high-fidelity screens.
> This document specifies the ~48 screens it did not cover, plus six corrections
> round 1's screens need. It is written to be pasted into Claude Design as-is.

---

## 0. What already exists — do not redesign it

Round 1 (project `4dddbb4b-bdbf-4e12-ae68-2970c0c5050d`) established and shipped:

**Foundations** — four themes (`dark` default, `light`, `sunlight` high-contrast, `night` driving);
semantic tokens `background / surface / surfaceRaised / border / textPrimary / textSecondary /
textMuted / primary / onPrimary`; 11 status tones each pairing a hue with a **shape and a glyph**;
a 7-step type scale plus a glanceable tier (56 / 40 / 21, tabular); 4dp spacing; radii
`compact 10 / hero 18 / pill 999`; five elevations; motion capped at 250ms; Archivo + JetBrains Mono.

**Components** — Button (5 variants × 6 states, 48dp minimum), StatusPill, Surface/Card, StopRow,
OrderCard, OfferCard, VehicleCard, ListRow, BreakRow, Identifier, Field + FieldAccessory + Segmented,
Banner (neutral/success/warning/danger/brand), OfflineBanner, EmptyState, ErrorState, Skeleton,
RouteProgress, HosGauge, StepBar, ScannerOverlay, ScanChecklistRow, BottomSheetSelect, map pins.

**Screens** — Today (light + dark), Route map (light + dark), Route list, Driving glance, Orders
(light + dark), Order detail, Edit payload item, Stop execution (light + dark + offline), Fuel log,
Report an issue, Inbox, Welcome, Find your organization, Verification code, Onboarding checklist.
The prototype adds the app shell, duty sheet and Account home.

**All of the above is implemented in code.** New screens must compose these components rather than
introduce parallel treatments. If a screen genuinely needs something new, say so explicitly and
specify it as an addition to the system, not a one-off.

---

## 1. Invariants — carried forward from round 1

1. **Identifiers render in full, monospaced, on their own line, never truncated.** Tracking numbers,
   entity IDs, serials, coordinates, plates. A driver matches these against a physical label.
2. **Never colour-only.** Every status pairs hue with shape and glyph.
3. **One unmistakable next action per screen**, in the bottom third, minimum 48dp.
4. **Offline is a state, not an error.** Calm neutral treatment, queued count visible, work never lost.
5. **Numerals are tabular** wherever they represent distance, time, money, odometer or counts.
6. **Dark is the default.** Every screen needs a dark and a light state; sunlight and night inherit.
7. **Design for ~30% text expansion and RTL.** The app is localised.
8. **Config-driven surfaces degrade honestly** — show a "not enabled" state, never fake data.

---

## 2. Six corrections to round 1's screens

These are mismatches between the delivered screens and the actual Fleetbase domain. Fix them in the
existing frames rather than creating new ones.

| # | Screen | Problem | Required change |
|---|---|---|---|
| 1 | `s06` Order detail | Hard-codes a 4-step `CREATED → EN ROUTE → ARRIVED → COMPLETED` stepper | Real flows are per-organisation, defined by `order-configs`. Redraw as a **dynamic stepper over an arbitrary activity list** (3–8 steps), with overflow behaviour for long flows |
| 2 | `s08` Stop execution | Hard-codes `ARRIVE → SCAN → PHOTO → SIGN → DONE` | Steps are declared per activity by the order config. Show the same visual vocabulary with **2, 4 and 7 steps**, and a variant where a step is optional vs. required |
| 3 | `s06` Customer block | "Phone number masked until arrival" — no such capability exists | Either specify the masked/unmasked pair as a real feature (and it becomes a backend requirement) or drop it. Recommend specifying it; it is the right behaviour |
| 4 | `s04` Driving glance | Renders a turn instruction ("Left onto Kings Road East · in 1.8 km") | Nothing produces manoeuvre steps today. Redraw scoped to **next stop + ETA + hand-off to Maps/Waze**, and mark turn-by-turn as a future variant |
| 5 | Account (prototype) | "Earnings £1,284 this wk" | No earnings, payout or rate data exists in FleetOps. Draw the row and screen as **config-gated, off by default**, with a clear empty state |
| 6 | Prototype fixtures | Truncates tracking numbers (`FLE…8718SG`) | Contradicts invariant 1. Use full identifiers in all fixture data |

---

## 3. Screens to design

Each entry: **what it is → what it must show → states → components to reuse.**
Field names in `code` are real API fields; use them as the source of truth for what data exists.

### A · Access and identity

**A1. Sign in** — email/password and OAuth alternates to the phone-first path in `s13`.
Show with 1, 2 and 4 auth methods present (per-organisation config). States: default, invalid
credentials, account locked, offline. Reuse Field, Button, Banner.

**A2. Permissions primer** — three-part explainer shown *before* the OS prompts: location "Always"
(the hard sell — state honestly what the organisation can and cannot see), notifications, camera.
States: primer, granted, **denied with recovery instructions**, "reduced accuracy" iOS variant.

**A3. Organisation switcher** — a driver may belong to several organisations; switching re-scopes the
whole session. Sheet listing org logo, name, role, active indicator. States: list, switching (the
session tears down — say so), switch failed, single-org (hide entry point entirely).

**A4. Self-hosted connection** — escape hatch behind a discreet affordance. Host URL, enrolment code,
realtime host/port/TLS. **No raw API-key field** — that is the credential model being removed.
States: empty, populated, testing, unreachable, connected.

**A5. Devices and sessions** — list active sessions (device, last used, current) with revoke.
States: list, revoking, only-session warning.

**A6. My documents** — driver's licence, insurance, right-to-work, certifications. Each with expiry
and colour-coded warning. States: complete, expiring soon, expired, rejected-with-reason, uploading.

**A7. Profile edit** — photo (camera/library), name, email, phone, emergency contact. One property per
screen is acceptable; make it feel deliberate. States: view, editing, saving, conflict.

### B · Route and manifests

Manifest data: `public_id`, `status` (`draft|active|in_progress|completed|cancelled`),
`scheduled_date`, `started_at`, `completed_at`, `total_distance_m`, `total_duration_s`, `stop_count`,
`completed_stops`, `pending_stops`, `driver_name`, `vehicle_name`.
Stop data: `sequence`, `status`, `estimated_arrival`, `actual_arrival`, `distance_from_prev_m`,
`duration_from_prev_s`, `tracking_number`, `address`.

**B1. Manifest list** — today plus upcoming and past. Row: date, vehicle, stop count, total distance,
total duration, status, completion progress. States: today only, multi-day, none assigned, past archive.

**B2. Stop detail** — everything about one stop: map snippet, address with copy/share, entry notes,
contact (call / message / masked number), window vs. ETA, the items for **this** stop with scan status,
required-proof preview, primary action for current state. This is the missing bridge between the route
list (`s03`) and stop execution (`s08`).

**B3. Optimise preview** — driver-triggered re-optimisation, shown as **before/after**: sequence
changes, distance and time saved, stops affected, then confirm or discard. States: preview,
already-optimal, unavailable (offline / engine down), applying.

**B4. Manual resequencing** — drag-to-reorder with a live "+12 min / +4.2 km" delta. Lock indicator for
stops with hard time windows and for completed stops. States: dragging, invalid drop, delta-worse
warning, saving.

### C · Stop execution

**C1. Exception / failed delivery** — reason-code picker (customer unavailable, refused, address
inaccessible, damaged, closed, no safe location, other), evidence capture, and outcome (reschedule /
return to depot / leave with neighbour). Must show **what the customer will be told**. States: picker,
evidence, outcome, confirm, queued-offline.

**C2. ID / age verification** — DOB entry or ID scan, pass/fail, and a refusal path that routes into C1.
States: prompt, scanning, pass, fail, refused.

**C3. Notes and custom fields** — dynamic form rendered from the order config. Design the **renderer**,
not one fixed form: text, select, multi-select, date, number, checkbox, photo. States: empty, filled,
validation error, no-fields-configured.

**C4. Complete stop — review** — read-only list of every captured proof before the irreversible confirm.
States: complete, missing-required-proof (blocked), confirming, success handing off to the next stop.

**C5. Proof of delivery summary** — read-only record for a completed stop: photos, signature, scans, GPS,
timestamps, signer name and relationship. States: full, partial, none captured.

**C6. Arrive — out of geofence** — "you appear to be 340 m from the stop — arrive anyway?" Plus the
passive auto-arrival confirmation with undo. States: auto-arrived, manual, out-of-range, GPS unavailable.

### D · Orders

**D1. Ad-hoc offer** — interrupting sheet: pickup, dropoff, distance from me, payout, expiry countdown,
Accept / Decline. States: single, **stacked multiple**, expired, taken by another driver, accepted.
(OfferCard exists; the interrupting presentation does not.)

**D2. Edit destination / waypoint** — change or correct an address: search, map-pin adjust, coordinate
entry. States: search, results, pin adjust, confirm, no results, offline.

**D3. Destination changed by dispatch** — the interrupting alert mid-route. States: alert, reviewing new
route, accepted, dismissed-with-consequence.

**D4. Entity / item detail** — single package: photo carousel, tracking number, scannable barcode,
dimensions, weight, price, destination, scan history. States: full, minimal metadata, damaged-flagged.

**D5. Order timeline** — chronological activity log with actor, timestamp, location. States: full,
sparse, live-updating.

**D6. Navigation hand-off** — the app picker (Apple Maps / Google Maps / Waze / Uber) plus a remembered
default. States: picker, no apps installed, default set.

### E · Vehicle and compliance

**E1. My vehicle** — assigned vehicle: photo, make/model/year, plate, VIN, fuel type, current odometer,
telematics status, inspection status, open defects, fleet. States: assigned, none assigned, offline data.

**E2. Change vehicle** — pick from available vehicles (list + search + **scan a vehicle QR tag**), confirm,
capture odometer, and gate on a pre-trip inspection where the organisation requires one. States: list,
scanning, confirm, already-assigned-to-another-driver, none available, inspection-required gate.

**E3. Pre-trip / post-trip inspection (DVIR)** — **the largest missing flow.** A guided checklist from an
org template, grouped by area (exterior, interior, brakes, lights, tyres, coupling, safety equipment).
Each item passes or raises a defect; defects require severity, photo and note. Ends with odometer,
driver certification signature, submission.
Design: the checklist (grouped, with progress), an item-defect capture, review-before-submit, the
submitted receipt, and the **"defect found — vehicle marked unsafe"** outcome.
**Must be fully completable offline** with a visible queued state on every step.

**E4. Inspection history** — past DVIRs with status and defect counts. States: list, detail, none yet.

**E5. Vehicle defects** — report against a vehicle: type, category, priority, status, report text, photos,
auto-attached location and odometer. Detail view carries a **timeline of status changes** and the link to
any resulting work order. States: create, list, detail, resolved.

**E6. Maintenance and work orders** — read-mostly: scheduled maintenance due, open work orders on my
vehicle, line items. Plus the "service due in 400 km" prompt that appears on Today. States: none due,
due soon, overdue, in progress.

### F · Reports and documents

**F1. Documents and receipts** — capture arbitrary documents (BOL, customs, receipts) against an order or
standalone. States: list, capture, uploading, upload failed with retry, none.

**F2. Fuel report detail / edit** — the record behind the `s09` list row, including the fuel-card match
state. States: draft, submitted, approved, rejected-with-reason, matched to card.

**F3. Issue detail** — the record behind `s10`, with the status timeline. States: open, in progress,
resolved, escalated.

### G · Inbox

**G1. Conversation** — message bubbles (self / other / system), sender identity, read receipts,
timestamps, attachments (photo, file, location), and an **order-context header** when the thread is tied
to a job, tapping through to the order. States: active, historical, unread divider, failed send, offline.

**G2. Composer** — text, camera, file, location share, plus quick-reply chips ("On my way", "Running 10
min late", "Arrived"). States: empty, typing, attachment preview, sending, send failed.

**G3. New conversation / participants** — searchable participant picker with avatars and roles.
States: search, results, selected, no results.

**G4. Notification detail** — the tap-through target for each notification type in `s11`.

### H · Account and settings

**H1. Settings** — language, theme (system / light / dark / night-driving / sunlight), units
(metric/imperial), default navigation app, notification preferences, background-tracking status with an
honest explainer, cache, diagnostics. States: default, tracking-disabled warning.

**H2. Earnings** (config-gated, off by default) — period selector, completed stops, on-time %, distance,
hours, payout summary. States: enabled with data, enabled but empty, **not available for this
organisation** (the default).

**H3. Help and support** — FAQ, contact dispatch, report a bug with logs attached.

**H4. Sign out** — confirmation that **warns about unsynced work** and names the count.

### I · System states

**I1. Sync queue** — the screen behind the OfflineBanner's queued count. Per-item status (pending,
syncing, failed, synced), what each item is, and retry. States: empty, queued, syncing, partial failure,
**conflict** ("this stop was completed by dispatch while you were offline").

**I2. Error states** — a documented set: network failure, permission denied, session expired (re-auth),
organisation access revoked, server unreachable, app version too old.

**I3. Push notifications** — lock-screen designs for: new order assigned, offer nearby, destination
changed, dispatch message, HOS warning, document expiring.

**I4. iOS Live Activity / Dynamic Island** and **Android foreground-service notification** for the active
stop: next stop, ETA, one-tap action. Background tracking already forces a persistent notification —
make it useful.

**I5. Tablet / large screen** — split view for Route (list + map) and Orders (list + detail).

---

## 4. Deliverables

1. High-fidelity frames for every screen in §3, dark primary, light for all of A, C, E.
2. The six corrections in §2 applied to the round 1 frames.
3. Flow diagrams for: vehicle change + DVIR, exception handling, offline capture → sync → conflict.
4. Any new component specified as a system addition, with all six states.
5. A short note on what you changed in the round 1 frames and why.

## 5. Open questions for the team

- **DVIR data model** — a distinct `inspections` resource, or ride on the existing `WorkOrder` /
  `Maintenance` models? Affects whether E3/E4 show work-order numbers or inspection IDs.
- **Contact masking** (correction 3) — confirm this becomes a real backend capability before designing
  the unmasked state.
- **Earnings** — confirm it stays off by default; if any customer has payout data, the shape of it
  determines H2.
