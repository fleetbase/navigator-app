# Prompt for Claude Design — Fleetbase Navigator (Driver App) Full Redesign

> Copy everything below the line into Claude Design. It is written to be self-contained:
> the designer needs no repo access.

---

# Brief: Redesign Fleetbase Navigator — the driver app for a multi-tenant fleet operations platform

## 0. What you are designing

**Navigator** is the driver-facing mobile app for **Fleetbase**, an open-source fleet & last-mile operations platform. Dispatchers work in a web console; drivers work in Navigator. It ships as a white-labelable app (self-hosted operators rebrand it) and as a public app on the App Store / Play Store where a driver joins whichever organisation employs them.

I need a **complete visual and interaction redesign**: a design system plus high-fidelity screens for every flow listed below, in **dark and light themes**, for **iOS and Android**, plus the key **tablet** layouts. The current app is functional but visually undesigned — a debug readout as a dashboard, unstyled forms in modal sheets, a 700-line order screen with stacked blue section bars, and no empty/error/offline states. Treat this as a ground-up product design, not a reskin.

The app is built in **React Native with Tamagui**, so design to a token system (colour / space / radius / type scale) that maps cleanly to Tamagui themes. Assume FontAwesome-class icons are available, and that `react-native-maps` (Apple Maps / Google Maps) renders the map surface.

---

## 1. Who uses it, and under what conditions

**Primary persona — the driver.** Delivery, courier, freight, field service. Might be a gig courier on a scooter or a Class-8 truck driver. Often:

- **One-handed, in daylight glare, sometimes wearing gloves.** Minimum 48×48dp touch targets; primary actions in the bottom third of the screen.
- **In motion or about to be.** The single next action must be unmistakable on every screen — never make the driver hunt.
- **On bad connectivity.** Basements, loading docks, rural roads. The UI must always tell the truth about what has and hasn't synced.
- **Non-native speakers.** The app is localised; design for ~30% text expansion and for RTL mirroring.
- **Battery-conscious.** Dark theme is the default and should be the better-looking of the two.

**Secondary persona — the operator/admin** who white-labels the app: brand colour, logo, and which tabs are enabled are all configurable. Your system must survive a swapped primary colour without falling apart.

**Design principle to hold throughout:** *the driver should never have to decide what to do next.* Every screen answers "what now?" with one dominant action, and everything else is secondary.

---

## 2. Design system (deliver first)

Produce a foundation page covering:

**Colour.** Dark-first, with a true light theme. Semantic tokens, not raw hues: `background`, `surface`, `surfaceRaised`, `border`, `textPrimary`, `textSecondary`, `textMuted`, `primary`, `onPrimary`, plus status families each with `bg`/`border`/`text`: `success`, `warning`, `danger`, `info`, `neutral`. The current app is built on the Tailwind palette (gray/blue/green/red/yellow/orange/indigo/purple/pink, 50–900) — you may keep that as the raw ramp, but the semantic layer is what screens reference. Include a **high-contrast / sunlight** variant and a **night-driving** variant (reduced blue, dimmed chrome).

**Order/task status colours.** These recur everywhere and must be legible at a glance, colour-blind safe, and distinguishable by shape/icon as well as hue: `created`, `preparing`, `dispatched`, `driver_assigned`, `driver_enroute`, `started`, `arrived`, `completed`, `canceled`, `failed`, `on_hold`. Design a **status pill/badge** component and a **stop-state marker** (map pin + list bullet variants).

**Type.** One family, 6–7 sizes. Numerals must be tabular where they represent distance/time/money/odometer. Specify the "glanceable" tier: ETA, stop number, and countdowns should be readable at arm's length.

**Space & radius.** 4dp base grid. Two card radii (compact and hero). Define elevation for: base surface, card, sheet, floating action, and map overlay.

**Motion.** Sheet presentation, list reorder, status-change confirmation, sync-success. Keep it under 250ms; nothing that delays a driver's next tap.

**Core components** to specify with all states (default / pressed / disabled / loading / error / skeleton):

- Buttons (primary, secondary, destructive, ghost, icon), full-width action bar
- Status pill, priority pill, count badge
- Card: order card, stop card, vehicle card, report card, chat row
- List row with leading avatar/index, trailing chevron/meta, swipe actions
- Bottom sheet (three detents: peek / half / full) — this is the app's primary modal idiom
- Form fields: text, phone (country picker), money (currency picker), unit (volume/distance picker), date/time, select, multi-select, searchable select, text area, signature pad, photo grid, toggle, segmented control
- Map overlays: driver puck, stop pin (numbered, by status), route polyline, cluster, recenter FAB, map/list toggle
- Progress: route progress bar, stop stepper, HOS gauge, upload progress
- Banners & toasts: offline, syncing, sync failed, permission required, new offer
- Empty, error, loading (skeleton), and **offline** states — as a documented set, not per-screen improvisation
- Scanner viewfinder overlay (barcode/QR) with success/reject feedback

**Accessibility.** WCAG AA contrast on all text and status pills; dynamic type at 200%; VoiceOver/TalkBack labels for icon-only controls; never colour-only status encoding.

---

## 3. Information architecture

Redesign around **five tabs** (tab set is config-driven; design so tabs can be hidden without breaking):

1. **Today** — the home surface. Replaces the current "Dash" debug panel.
2. **Route** — manifest / stop list / map. New.
3. **Orders** — order browsing, history, search. Reworked.
4. **Inbox** — chat with dispatch and customers + notifications. Reworked.
5. **Account** — profile, vehicle, compliance, reports, settings.

Also design the **global chrome**: a compact app bar with org/brand identity and a **duty control** (see §4.2) — the current header wastes a full row on a logo, a version string, and an ambiguous green toggle.

---

## 4. Screens to design

For each screen give: default state, loading (skeleton), empty, error, **offline**, and where relevant the "action in flight / queued" state. Note anything that changes between iOS and Android.

### 4.1 Onboarding & authentication

The current bootstrap embeds a shared organisation API key in a deep link and stores it on every handset. The redesign replaces it with a **platform-token + per-driver-session** model. Design for it explicitly.

1. **Splash / boot** — brand mark, connection check, restore-session. Include the "cannot reach server" state with a retry and a link to advanced connection settings.
2. **Welcome / entry** — sign in, or join an organisation. Show which server the app is pointed at when it is not the default cloud (self-hosted operators need this).
3. **Find your organisation** — three parallel paths, one screen: enter a **join code**, **scan an org QR**, or **open an invite link**. Show the resolved organisation (logo, name, location) with a confirm step before proceeding. Include "code not recognised" and "this invite has expired" states.
4. **Sign in** — phone-first (country picker + number), with email/password and Apple / Google / Facebook as alternates. Alternates are configurable per organisation, so design the layout with 1, 2, and 4 methods present.
5. **OTP verification** — 6-digit entry, resend countdown, "sent via SMS / sent via email" distinction (the backend falls back from SMS to email), wrong-code and expired states.
6. **Create account** — name, phone, then verification. Then an org-supplied onboarding form whose fields are **driven by per-organisation onboard settings** — design it as a dynamic form renderer (text, select, date, file upload, consent checkbox) rather than a fixed layout.
7. **Driver onboarding checklist** — a progress-tracked list: profile photo, driver's licence (front/back capture + expiry), insurance, right-to-work, vehicle assignment, permissions. Each item: not started / in review / approved / rejected-with-reason. Include the "awaiting dispatcher approval" holding state, since a request-to-join needs approval before the driver gets work.
8. **Permissions primer** — three screens or one stacked flow explaining *why* before the OS prompt: **location "Always"** (this is the hardest sell — explain background tracking honestly and show what the org can and cannot see), notifications, camera/photos. Include the "denied — here's how to fix it in Settings" recovery state.
9. **Organisation switcher** — a driver may belong to multiple organisations; switching re-scopes their whole session. Design as a sheet listing orgs with logo, name, role, and an active indicator, plus the "switching…" transition state.
10. **Advanced / self-hosted connection** — host URL, enrolment code, realtime host/port/TLS. This is an escape hatch: keep it out of the main path, behind a discreet affordance. **No raw API key field** — that is what we are removing.
11. **Session & device management** (in Account) — list active devices with last-used, revoke.

### 4.2 Duty, shift & compliance

The backend already computes hours-of-service (daily/weekly hours against daily/weekly limits with a compliance flag) and tracks shifts and scheduled shift items.

12. **Duty control** — persistent in the app bar. Three states: **Off duty / On duty / On break**. The current app has a single green online/offline switch with no shift semantics. Design the control plus its confirmation sheet (start shift → optional pre-trip inspection prompt; end shift → summary).
13. **HOS card & detail** — drive / shift / cycle / break countdowns as gauges, remaining time prominent, pre-violation warning at a configurable threshold, and a "not required for this driver" variant (many orgs are exempt). Detail view: today's shifts, weekly total, limit source.
14. **Break flow** — start break, break countdown, and **planned breaks appearing inline in the route list** with a heads-up before they begin.

### 4.3 Today (tab 1)

15. **Today home** — the single most important screen. Stacked, scannable cards, in priority order:
    - **Next action card** (hero): the next stop — sequence number, address, customer, window, ETA, distance — with one dominant CTA that changes by state: *Start shift* → *Start route* → *Navigate* → *Arrive* → *Complete stop*.
    - **Route progress**: X of Y stops, distance remaining, estimated finish, on-time/behind indicator.
    - **Shift & HOS** summary strip.
    - **Vehicle** strip: assigned vehicle, inspection status (due / passed / defects), fuel or odometer prompt.
    - **Alerts**: new order offers, dispatch messages, failed syncs, expiring documents.
    - **Quick actions**: report issue, log fuel, message dispatch, scan.
    - Day stats: completed stops, distance driven, hours.
    - Design **shift-not-started**, **no work assigned**, and **day complete** variants of this screen — three genuinely different layouts, not one screen with an empty list.

### 4.4 Route & manifests (tab 2)

A **manifest** is a committed, optimised plan for one driver + vehicle for a date: an ordered list of stops, each linked to an order, a place, and optionally a specific waypoint, with per-leg distance/duration and an estimated arrival. Status runs `draft → active → in_progress → completed | cancelled`. Stops carry `sequence`, `estimated_arrival`, `actual_arrival`, and a status.

16. **Manifest list** — today plus upcoming/past manifests: date, vehicle, stop count, total distance, total duration, status, completion progress.
17. **Manifest / route detail — list view** — the workhorse screen. An ordered, sequence-numbered stop list. Each row: sequence badge (state-coloured), address + place name, customer, time window, ETA, distance from previous, type (pickup / dropoff / waypoint / break), package count, and status. Sticky summary header (stops remaining, distance, ETA to finish). Swipe actions and an overflow per stop (navigate, call, message, skip, report exception). Show the **current stop pinned** and completed stops collapsed.
18. **Manifest / route detail — map view** — same data on a map: numbered pins by status, route polyline, driver puck, current-leg emphasis, bottom sheet peeking the next stop; drag the sheet up to get the list. Design the list⇄map toggle as a single persistent control.
19. **Optimise route** — a driver-triggered re-optimisation. Show a **before/after preview**: sequence changes, distance/time saved, stops affected — then confirm or discard. Include "already optimal" and "optimisation unavailable/offline" states.
20. **Manual resequencing** — drag-to-reorder with a live "this adds +12 min / +4.2 km" delta and a lock indicator for stops with hard time windows or already-completed stops.
21. **Stop detail** — everything about one stop: map snippet, address with copy/share, entry notes, contact (call / message / masked number), time window vs. ETA, the packages/items for *this* stop with scan status, required proof preview, and the primary action for the current state.

### 4.5 Stop execution — the money flow

Design this as a **guided, non-skippable sequence** whose steps are configured per organisation. Steps may include any of: scan, photo, signature, ID/age verification, notes, custom form fields.

22. **Arrive** — arrival confirmation, with **geofence auto-arrival** (arrived automatically; show the passive confirmation and let the driver undo). Include the "you appear to be 340m from the stop — arrive anyway?" out-of-geofence variant.
23. **Load / unload scan** — camera viewfinder with an overlay listing expected items; per-scan success (green), duplicate (amber), unexpected item (red). Progress "7 of 12 scanned". Support multi-scan without leaving the camera, plus manual entry fallback for a damaged label.
24. **Capture photo proof** — capture, review, retake, annotate, multi-photo grid, per-photo caption. Show the timestamp/GPS stamp that gets attached.
25. **Capture signature** — full-bleed signature pad, signer name and relationship, clear/retry, landscape support.
26. **ID / age verification** — DOB entry or ID scan, pass/fail, and a refusal path.
27. **Notes & custom fields** — dynamic form from the organisation's order config.
28. **Complete stop** — a review screen listing every captured proof before the irreversible confirm; then a success state that immediately previews the *next* stop.
29. **Exception / failed delivery** — reason code picker (customer unavailable, refused, address inaccessible, damaged, closed, no safe location, other), evidence capture, and outcome: reschedule / return to depot / leave with neighbour. Show what the customer will be told.
30. **Order/stop activity picker** — the org-defined activity flow (e.g. "Driver Enroute", "Arrived", "Loaded", "Delivered"). Today this is an unstyled bottom-sheet list; redesign it as a clear state-machine progression showing where the order is now, what comes next, and what is not yet reachable.
31. **Proof of delivery summary** — read-only view of everything captured for a completed stop: photos, signature, scans, GPS, timestamps, who signed.

### 4.6 Orders (tab 3)

32. **Order list** — segmented by *Active / Scheduled / Completed / Cancelled*, with search (tracking number, customer, address), filters (status, date range, type, customer), and sort. Keep a compact date strip for day navigation, but redesign it: the current calendar strip eats 100dp and shows five days with barely legible dots.
33. **Order card** — tracking number, status pill, customer, pickup → dropoff summary, stop count, scheduled time, distance/duration, item count, and a progress bar. Design compact and expanded variants.
34. **Order detail** — replace the current 700-line stacked-blue-bars screen. Structure it as: sticky header (tracking number, status, QR/label access) → map with route → primary action bar → then collapsible sections: **Route & waypoints**, **Progress & ETA** (current/next destination, total distance, start time, ETA, ECT), **Payload & items** (grouped by destination, each entity with photo, tracking number, price, and an **edit** affordance), **Customer & contacts** (call / email / chat per waypoint), **Documents & files**, **Comments**, **Proof of delivery**, **Order notes**, **Custom fields**, **Order info** (IDs, internal id, tracking number, created/scheduled/dispatched timestamps). Design the section collapse/expand and a jump-to-section control — this screen is long by nature.
35. **Edit order details** — inline editing for driver-permitted fields only (notes, custom fields, and a server-declared allowlist). Show clearly what is editable vs. locked and why.
36. **Edit payload entity** — per-item editing where the organisation permits it: name, description, SKU, serial, dimensions, weight, declared value, quantity, photo, destination reassignment, damage flag. **The editable field set is server-declared per order config** — design a dynamic field renderer, plus the "nothing is editable on this order" state.
37. **Edit destination / waypoint** — change or correct an address (search, map-pin adjust, coordinate entry), and set the current destination when an order has multiple waypoints. Include the "destination changed by dispatch" alert that interrupts the driver mid-route.
38. **Entity / item detail** — single package: photo carousel, tracking number, QR/barcode for scanning, dimensions/weight, price, destination, scan history.
39. **Order offers (adhoc)** — an incoming unassigned nearby job. Design as an interrupting card/sheet: pickup, dropoff, distance from me, payout, expiry countdown, Accept / Decline. Include the stacked-multiple-offers case and the "offer expired / taken by another driver" state.
40. **Order history / timeline** — chronological activity log with actor, timestamp, and location.
41. **Navigation hand-off** — the current app opens Apple Maps / Google Maps / Waze / Uber via a plain action sheet. Redesign the picker, and design an **in-app navigation preview**: route polyline, turn list, distance/ETA, "open in…" as the escape.

### 4.7 Vehicle & compliance (in Account)

`VehicleScreen` is currently a stub that renders the word "VehicleScreen". Design the whole area.

42. **My vehicle** — assigned vehicle card: photo, make/model/year, plate, VIN, fuel type, current odometer, telematics/connected-device status, inspection status, open defects, assigned fleet.
43. **Change vehicle** — pick from available vehicles (list + search + QR scan of a vehicle tag), with a confirm step, an odometer reading capture, and a required pre-trip inspection gate where the organisation demands one. Include "vehicle already assigned to another driver" and "no vehicles available".
44. **Pre-trip / post-trip inspection (DVIR)** — a guided checklist from an org template, grouped by area (exterior, interior, brakes, lights, tyres, coupling, safety equipment). Each item: pass / defect. Defects require severity, photo, and note. Ends with odometer, driver certification signature, and submission. **Must be fully completable offline** with a clear queued state. Design: the checklist, an item-defect capture, the review-before-submit, the submitted receipt, and the "defect found — vehicle marked unsafe" outcome.
45. **Inspection history** — past DVIRs with status and defect counts.
46. **Vehicle issues / defects** — report an issue against a vehicle: type, category, priority, status, report text, photos, location auto-attached. Design the create form, the list, the detail with a **timeline** of status changes, and the link from a defect to a resulting work order.
47. **Maintenance & work orders** — read-mostly: scheduled maintenance due, open work orders on my vehicle, line items, and a "vehicle is due for service in 400 km" prompt on Today.

### 4.8 Reports (in Account)

48. **Fuel log — list & create** — the current form is four unlabelled fields in a sheet. Redesign: odometer, volume + unit picker, cost + currency picker, fuel type, station (with location autofill), receipt photo, and derived economy (L/100km or MPG) shown back to the driver. Include a fuel-card transaction match state where the org has a fuel provider connected.
49. **Fuel report detail / edit.**
50. **Issue reports — list, create, detail, edit** — same content model as vehicle defects but driver/general scoped: type, category, priority, status, report, photos, location, timeline of updates.
51. **Documents & receipts** — capture and file arbitrary documents (BOL, customs, receipts) against an order or standalone; list, preview, and upload status.

### 4.9 Inbox (tab 4)

52. **Conversation list** — dispatch channels, order-linked threads, and customer threads. Row: avatar stack, title, last message preview, timestamp, unread badge. The current list shows generic grey silhouettes and "Untitled Chat" — fix identity and naming.
53. **Conversation** — message bubbles (self / other / system), sender identity, read receipts, timestamps, attachments (photo, file, location), and an **order context header** when the thread is tied to a job, with a tap-through to the order.
54. **Composer** — text, camera, file, location share, and quick-reply chips ("On my way", "Running 10 min late", "Arrived").
55. **New conversation / participants** — searchable participant picker, avatars, roles.
56. **Notifications inbox** — dispatch alerts, order assignments, document expiries, system messages; read/unread, grouped by day, tap-through to the subject.

### 4.10 Account (tab 5)

57. **Account home** — driver identity card (photo, name, organisation, driver ID, rating if enabled), then grouped entries: Vehicle, Compliance & documents, Reports, Earnings, Settings, Help, Legal, Sign out.
58. **Profile & edit property** — photo (camera/library), name, email, phone, emergency contact, address. The current pattern of one screen per field is fine; make it feel intentional.
59. **My documents** — licence, insurance, certifications with expiry dates and colour-coded expiry warnings, re-upload flow.
60. **Earnings / performance** (config-gated) — period selector, completed stops, on-time %, distance driven, hours worked, and payout summary where the org exposes it.
61. **Settings** — language, theme (system/light/dark/night-driving), units (metric/imperial), default navigation app, notification preferences, background tracking status with an honest explainer, data/cache, and diagnostics.
62. **Help & support** — FAQ, contact dispatch, report a bug with logs attached.
63. **Sign out** — confirmation that warns about unsynced work.

### 4.11 Cross-cutting states

64. **Offline & sync** — a persistent, non-alarming offline indicator; a **sync queue screen** listing pending actions (completions, proofs, inspections) with per-item status and retry; a "3 actions synced" success toast; and a conflict state ("this stop was completed by dispatch while you were offline").
65. **Push notifications & system surfaces** — lock-screen notification designs for: new order assigned, offer nearby, destination changed, dispatch message, HOS warning, document expiring. Plus an **iOS Live Activity / Dynamic Island** and an **Android foreground-service notification** for the active stop (next stop, ETA, one-tap action) — background tracking already requires a persistent notification, so make it useful.
66. **Errors** — network failure, permission denied, session expired (re-auth), organisation access revoked, server unreachable, app version too old.
67. **Tablet / large screen** — split view for Route (list + map) and Orders (list + detail).

---

## 5. Data the screens must accommodate (from the live API)

Design to these real shapes — don't invent fields that don't exist, and don't drop ones that do.

**Order**: `id` (`order_…`), `internal_id`, `tracking_number`, `status`, `adhoc`, `dispatched`/`dispatched_at`, `started`/`started_at`, `scheduled_at`, `driver_assigned`, `customer` (name, email, phone, photo), `facilitator`, `type`, `distance` (metres), `time` (seconds), `notes`, `custom_fields[]`, `order_config` (defines the activity flow), `payload{ pickup, dropoff, waypoints[], current_waypoint, entities[] }`, `tracker_data`, `eta`, `comments[]`, `files[]`, `proofs[]`, `purchase_rate`.

**Waypoint / Place**: `id`, `name`, `address`, `street1`, `city`, `postal_code`, `country`, `location` (lat/lng), `tracking_number.status_code`, `customer`, `type` (pickup/dropoff/waypoint), `meta`.

**Entity (payload item)**: `id`, `name`, `description`, `tracking_number`, `sku`, `serial_number`, `photo_url`, `length/width/height/weight` + units, `price`, `sale_price`, `currency`, `declared_value`, `destination` (waypoint id), `meta`.

**Manifest**: `id` (`manifest_…`), `driver_name`, `vehicle_name`, `status` (`draft|active|in_progress|completed|cancelled`), `scheduled_date`, `started_at`, `completed_at`, `total_distance_m`, `total_duration_s`, `stop_count`, `completed_stops`, `pending_stops`, `notes`.

**Manifest stop**: `id` (`mstop_…`), `sequence` (1-indexed, optimiser output), `status` (`pending|arrived|completed|…`), `estimated_arrival`, `actual_arrival`, `distance_from_prev_m`, `duration_from_prev_s`, `tracking_number`, `address`, plus links to order / place / waypoint.

**Driver**: `id`, `name`, `photo_url`, `phone`, `email`, `online`, `status`, `vehicle`, `vendor`, `current_job`, `location`, `heading`, `altitude`, `speed`, `city`, `country`, `meta`.

**HOS status**: `daily_hours`, `weekly_hours`, `daily_limit`, `weekly_limit`, `hos_source`, `is_compliant` (defaults 11h daily / 70h weekly).

**Vehicle**: `id`, `display_name`, `make`, `model`, `year`, `plate_number`, `vin`, `type`, `status`, `online`, `photo_url`, `location`, `fleet`, attached `devices`/`sensors`.

**Issue**: `type`, `category`, `priority` (low/medium/high/critical/scheduled-maintenance), `status` (pending/in-progress/completed/backlogged/requires-attention/…), `report`, `driver`, `vehicle`, `location`, `created_at`, timeline of updates.

**Fuel report**: `status` (draft/pending-approval/approved/rejected/…), `odometer`, `volume` + unit, `amount` + currency, `driver`, `vehicle`, `location`, `created_at`.

**Chat channel**: `name`, `participants[]` (name, avatar, type), `messages[]` (sender, content, attachments, `created_at`, read receipts), `unread_count`.

**Organisation**: `id`, `name`, `logo_url`, `description`, `country`, `timezone`, plus per-org **driver onboard settings** (a dynamic field schema) and per-org **entity editing settings** (which entity fields a driver may edit, per order config).

---

## 6. Constraints and non-goals

- **React Native + Tamagui.** Design to components and tokens, not to bespoke one-off layouts. Flag anything that needs a native module.
- **White-label safe.** Show every key screen with the default brand *and* with one swapped primary colour + logo, to prove the system holds.
- **Config-driven surfaces.** Tabs, login methods, onboarding fields, activity flows, editable entity fields, and required proof types are all server-configured. Design for dynamic renderers with sensible fallbacks, and show at least one "minimal configuration" variant where most optional features are off.
- **Two map providers.** Apple Maps on iOS, Google Maps on Android — the map chrome differs; don't design an overlay that only works on one.
- **Offline is a first-class state**, not an error. Anything a driver does at a stop must be completable with no signal.
- **Not designing** the dispatcher web console, the customer tracking page, or the storefront app.

---

## 7. Deliverables

1. **Design system page** — tokens, type, colour (dark + light + high-contrast + night), spacing, elevation, motion, and the full component library with states.
2. **High-fidelity screens** for every numbered item in §4, dark theme primary, light theme for at least the 15 highest-traffic screens.
3. **Flow diagrams** for: onboarding & organisation join, shift start → route → stop execution → shift end, exception handling, vehicle change + DVIR, and offline capture → sync.
4. **Interactive prototype** covering the golden path: sign in → join org → start shift → pre-trip inspection → view route → optimise → navigate → arrive → scan → capture proof → complete → next stop → end shift.
5. **Redlines / spec** for the 10 most complex screens (Today, route list, route map, order detail, stop execution sequence, DVIR, manifest optimise preview, chat, fuel log, onboarding checklist).
6. **A written rationale** — what changed from the current app and why, in a form I can share with engineering.

---

## 8. Current-app screenshots for reference (what we are replacing)

I'll attach screenshots of the existing app. For context, what they show and what is wrong:

- **Dash** — "Tracking: Yes", raw latitude `47.91608775859809`, longitude, heading `-1`, altitude, and two zeroed tiles (Active Orders, Speed). It is a debug panel, not a driver home screen.
- **Orders (day view)** — a 100dp calendar strip over "Friday orders · 0 order · 0 stop left · 0s · 0 meters", an info banner, then "Active Orders: 4" with map-thumbnail cards. Two competing lists on one screen, unpluralised strings, and the day's summary reads zero while four orders are active.
- **Order detail** — full-width saturated blue section bars ("Order Payload", "Order Route", "Order Progress", "Order Notes", "Order Proof", "Order Documents & Files", "Order Comments") stacked down an endless scroll; ETA reads "114h 1m" and ECT "May 12th, 2026".
- **Select activity / Select destination** — bottom sheets with a single bare-coloured option and no hierarchy.
- **Reports** — a two-tab switch, "No Fuel Reports" centred in a void, and a create form of four unlabelled fields with inline unit/currency buttons.
- **Chat** — grey silhouette avatars, "Untitled Chat / No messages", flat green/blue bubbles, and a redundant sender name above every message.
- **Account** — a long undifferentiated list of label→value rows, with a red "Sign Out" button and the app version printed twice on screen.

Design the replacement so none of these screenshots would be mistaken for the new app.
