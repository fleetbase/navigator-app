# Prompt for Claude Design — Navigator v3, design round 3

> Paste everything below the line into Claude Design, in the existing Navigator
> project, with `NavigatorAppRedesignv3.pdf` (the 19 round 1 frames, s01–s19) attached.
> It is self-contained: the designer needs no access to the code.

---

# Brief: Navigator v3 — take the round 1 concepts to a complete, production-ready app

## 0. What I'm asking for

**Navigator** is the driver app for **Fleetbase**, an open-source fleet and last-mile operations platform. Dispatchers work in a web console; drivers work in Navigator on their phone. One build serves a whole Fleetbase instance (many organisations), and operators also ship it white-labelled.

Round 1 (attached, frames s01–s19) set a direction I like: map-first routing, one unmistakable next action, full identifiers, no decorative noise. We built an app from it. **Running that app on a real phone, it falls well short of the mockups and of what a driver needs.** It is close in vocabulary and far in experience.

I want a **new, complete set of mockups** that:

1. Keeps what works in round 1 and **improves on it** in design, usability and function. You are free to propose new concepts, not only refine the old ones.
2. Covers **every major screen and function of the app**, with the states each needs, so we have one visual target for the whole product.
3. Is an **interactive prototype** for the main flows (first run → sign in → home → a full delivery → end of shift), plus static frames for everything else.

Treat this as product design, not a reskin. Where a round 1 screen is weak, replace it and say why.

## 1. What is wrong with what we built

These are observations from using the current build on a phone. Each one is something the new mockups must fix.

- **There is no real home screen.** "Today" is one card for the next drop-off and nothing else. Round 1's s01 had a route map, stop progress, vehicle and time-left cards; none of it carries the day. A driver opening the app should know in two seconds: am I on duty, what is next, how is my day going, is anything wrong.
- **Maps are missing where they matter.** The next-stop card, order cards and order detail had maps in round 1 and lost them in the build. A map is how a driver recognises a job.
- **Onboarding is gone.** Round 1's welcome (s13), find-your-organisation (s14) and onboarding checklist (s16) were never built. The app opens on a bare sign-in form. There is no first-run, no explanation, no permission priming in context.
- **Sign-in is unfinished.** Phone number is the main way in, email and password the alternative. The phone field needs a proper country picker, the code entry needs to feel like s15, and button states (disabled, loading, enabled) must be unmistakable.
- **Screens feel loose and unfinished.** Content floats at the top of otherwise empty screens. Short screens need intentional composition: anchored actions, purposeful empty space, real empty states.
- **Dead ends.** The app showed drivers features their organisation doesn't have ("Not enabled") with nothing they could do about it. Never show a driver something they can't act on.
- **Connecting to a different server doesn't work as a typed address.** See §5, "Linking to an instance".
- **Hierarchy is flat.** Too many equal-weight cards and same-size labels. The round 1 frames have clear primary/secondary/tertiary levels; the build lost them.

## 2. Who uses it, and how

- **Drivers**: parcel couriers, freight and truck drivers, field-service staff, gig couriers. Often one-handed, outdoors in glare or at night, sometimes gloved, usually in a hurry.
- **Glance, then act.** Most interactions are under five seconds. The next action belongs in the bottom third of the screen, at least 48dp tall.
- **Bad connectivity is normal.** Basements, rural roads, depots. Work is captured offline and synced later.
- **Mixed fluency and languages.** The app is localised (allow ~30% text growth, and right-to-left). Prefer plain words and icons with labels.
- **They don't choose the app.** Their employer does. It has to be learnable in one shift with no training.

## 3. Rules that carry over from round 1

1. **Identifiers in full, monospaced, on their own line, never truncated**: tracking numbers, entity ids, plates, serials. Drivers match them against a physical label.
2. **Never colour alone.** Every status pairs colour with a shape or glyph and a word.
3. **One primary action per screen**, bottom third, 48dp minimum.
4. **Offline is a state, not an error.** Calm treatment, queued count visible, nothing lost.
5. **Tabular numerals** for time, distance, money, counts, odometer.
6. **Four themes**: dark (default), light, sunlight (high contrast), night (driving). Design dark and light for everything; show sunlight and night for the driving surfaces.
7. **Type and colour**: Archivo for UI, JetBrains Mono for identifiers. The primary blue is the default brand colour; the design must survive a client swapping it (white-label), so don't lean on blue for meaning.
8. **Only show what the driver can act on.** A feature the organisation hasn't enabled is absent, not greyed out.
9. **Scrolling**: a screen whose content fits does not scroll or bounce. Lists that refresh are pulled to refresh.

You may challenge any of these if you have a better idea. Say so explicitly.

## 4. What the platform can actually do

Design to this. Mark every frame with one of three tags so we know what is buildable now:

- **LIVE**: the server supports it today.
- **PARTIAL**: some of it exists; note what is assumed.
- **NEEDS BACKEND**: a new idea that needs server work. These are welcome, clearly labelled, and should never be the only way to complete a core flow.

### Live today

- **Sign-in**: phone number with a texted six-digit code (the server falls back to email if the text fails, and says which it used); email and password; forgot and reset password with a code.
- **Organisations**: a driver can belong to several and switch between them. The server can list and search organisations by name before sign-in.
- **Duty**: on duty / off duty. Location is shared only while on duty.
- **Orders**: active, scheduled and completed lists; search; order detail. Each order has a pickup, a drop-off and optional waypoints in between, a customer, notes, a schedule, and a payload of items (each with its own id, and optionally photo, weight, dimensions, value).
- **Order flow is defined per organisation.** Each order type has its own list of activities (3 to 8 steps, with any names). The server tells the app the next allowed step or steps; sometimes there is a choice. Never draw a fixed "created → en route → arrived → completed".
- **Proof of delivery is per step**: none, signature, photo, or scan (QR and barcode, multi-scan against the expected items). Captured before the step completes.
- **Live tracking data per order**: ETA, distance and time remaining, progress, the stops with done/active state, and **the real road route as a line** (from the organisation's routing engine).
- **Changing destination**: the driver can pick which stop they are heading to; dispatch can change it too, and the app is told live.
- **Item edits**: the server declares which fields of an item the driver may edit (round 1's s07 is right).
- **Cash on delivery**: an order can require the driver to confirm cash was collected.
- **Offers**: unassigned nearby jobs any driver may accept or decline, some with a countdown.
- **Routes (manifests)**: a day's stops in sequence, with status, ETA and distance per stop; today, upcoming and past; stop detail; arrive, complete or skip a stop; automatic arrival by geofence; server-side re-optimisation of the remaining stops with a before/after.
- **Navigation hand-off**: to Apple Maps, Google Maps, Waze or Uber, with a remembered default. **There is no in-app turn-by-turn.**
- **Vehicle**: assigned vehicle details; changing vehicle; trailers (view); **inspections** from organisation-defined forms (checklist, defects with severity, photo and note, signature, a pass / unsafe result, history).
- **Reports**: fuel log (list, add, detail); issues (list, report with type, category, priority, description and location; detail).
- **Inbox**: chat with dispatch, customers and other drivers; group channels; photo attachments; quick replies; unread counts; a thread can be tied to an order.
- **Push notifications and live updates** over a socket while the app is open.
- **Offline queue**: actions taken offline are queued, shown, retried, and can fail individually.
- **Account**: profile edit, organisation switcher, settings (language, theme, units, default navigation app), help with diagnostics, sign out.
- **Platforms**: iOS, Android, and a web build shown as a phone-width column.

### Partial

- **Driver onboarding requirements**: organisations can define onboarding settings (for example required documents), but the app has no flow for them yet.
- **Earnings**: a wallet with a balance and transactions exists; it is off unless the organisation enables it.
- **In-app notification list** (round 1's s11 lower half): notifications arrive as pushes; a stored list is not confirmed.

### Not in the backend (label NEEDS BACKEND if you use them)

- Hours of service, drive-time limits, planned breaks, shifts (round 1's "Drive time left" and "Planned break").
- Turn-by-turn instructions (round 1's s04 "Left onto Kings Road East").
- Masked customer phone numbers.
- Join codes and dispatcher-approved join requests (round 1's s14). Today a driver account is created by the organisation.
- Document upload with approval (round 1's s16), devices and sessions, maintenance and work orders for drivers.

## 5. Problems I want new thinking on

Round 1 didn't solve these, or the build showed the solution was not enough. Propose concepts; give me two options where the trade-off is real.

1. **Home.** What is the right home for a driver? It should adapt to the moment: before the shift (go on duty, vehicle check, what's assigned), during it (next stop with map, day progress, anything needing attention), between jobs (offers, what's scheduled), end of day (summary, sign off). It must also work for a driver with a route of 40 stops and one with single ad-hoc orders and no route at all.
2. **Routes and orders are two views of the same work.** A driver may have a manifest of stops, loose orders, or both. Round 1 gave them separate tabs. Is that right? Propose the information architecture and the tab bar, and show how one job looks from each side.
3. **The delivery itself, end to end.** From "next stop" to "done, next": navigate, arrive, the organisation's own steps, proof, exceptions (customer not there, refused, damaged, wrong address), completion, and the hand-over to the next stop. This is the core loop; it should take the fewest taps of any flow in the app.
4. **Maps everywhere they help.** Next-stop card, order cards, order detail, stop detail, route. Define the map language once: pins by state, the driver, the route line (done / current / upcoming), the fallback when there is no road route (a dashed straight line), light and dark tiles.
5. **First run and sign-in.** Welcome, phone number with country picker, code entry, the email alternative, forgot password, choosing an organisation when the driver has several, permission priming at the moment each is needed (location "always", notifications, camera), and the first-day checklist if the organisation has requirements.
6. **Linking to an instance.** Self-hosted operators run their own server. A typed address is not enough, because the app also needs that server's access token and live-update settings. The intended design: the operator's console shows a QR code (or sends a link); the driver scans it and the app is connected. Design that flow, including "connected to *X*", switching back, and failure. No typed credentials.
7. **Driving.** A glance surface for when the phone is in a cradle: next stop, ETA, one big action, hand-off to the driver's maps app. Night theme. No turn-by-turn unless labelled NEEDS BACKEND.
8. **Interruptions.** A new offer, a destination changed by dispatch, a message, an order taken away. How each arrives while the driver is doing something else, without losing their place.
9. **Offline and sync.** How the driver knows they are offline, what is queued, what failed, and what to do about it, on every screen and in one place.
10. **White-label.** Show the home screen and sign-in in the default brand and in two other brands (different colour, logo, radius) to prove the system holds.

## 6. Screens to cover

Every item needs its real states: loading, empty, error, offline, and the long-content case. Reuse one component vocabulary throughout.

**A. First run and access**
Welcome · sign in by phone (country picker, validation) · code entry (resend timer, sent by email instead, wrong code) · sign in by email · forgot and reset password · choose organisation · link to an instance by QR · permission primers (location, notifications, camera; granted, denied with recovery) · first-day checklist (PARTIAL) · session expired · app update required.

**B. Home**
Before shift · on duty with a next stop · on duty with nothing assigned · offers available · end of day · something needs attention (failed sync, inspection due, message) · going on and off duty (with the warning when stops remain).

**C. Work: routes and orders** (structure per your answer to §5.2)
Route list and map · today / upcoming / past · stop detail · re-optimise preview · order list (active, scheduled, completed, search, no results) · order card with map · order detail · order timeline · item detail · edit item · change destination · destination changed by dispatch · cash to collect · order removed or reassigned.

**D. Doing a stop**
Navigation hand-off and app picker · driving glance · arrive (automatic, manual, far from the stop) · step list for 2, 4 and 7 steps, including a choice of next step · scan (multi-scan, duplicate, unexpected item, manual entry) · photo (capture, review, retake, from library) · signature · review before completing · completed and next stop · exception: reason, evidence, outcome (the reason list is LIVE as an issue report; structured outcomes are NEEDS BACKEND).

**E. Offers**
Offer list · offer detail with map, distance, countdown · accept and decline · expired · taken by someone else · an offer arriving during other work.

**F. Vehicle**
My vehicle · change vehicle · trailers · inspection: start, checklist, defect capture, review and sign, result (passed, unsafe), history and detail · fuel log, add fill-up, detail · issues: list, report, detail.

**G. Inbox**
Conversation list · conversation (text, photos, quick replies, order context, failed send) · new conversation · notifications (PARTIAL).

**H. Account**
Account home · profile edit · organisation switcher · settings · permissions status · earnings (PARTIAL; and absent when off) · help and diagnostics · sync queue (queued, syncing, failed, conflict) · sign out with unsynced work.

**I. System**
Offline bar and its states · toasts and banners · push notification designs (new order, offer, destination changed, message) · iOS Live Activity and Android ongoing notification for the active stop (NEEDS BACKEND is fine) · tablet and web layouts for home, route and order detail.

## 7. What to deliver

1. **A short concept note first**: the information architecture and tab bar you propose, the home concept, and what you changed from round 1 and why. I will react to this before the full set.
2. **An interactive prototype** of the core flows: first run → sign in → home → route → a full stop with scan, photo and signature → next stop → an offer interrupting → going off duty.
3. **Static frames for every screen in §6**, in dark and light, phone size (390 × 844), with the states listed. Night and sunlight for home, route map and driving.
4. **The component library** as its own page: every component with its states (default, pressed, focused, disabled, loading, error), including the map language, inputs (text, phone with country picker, code boxes, select, segmented, date), sheets, banners, cards, list rows, steppers, empty and error states, skeletons.
5. **Tokens**: colour by theme, type scale, spacing, radii, elevation, motion. Say which change under white-label.
6. **Each frame tagged** LIVE / PARTIAL / NEEDS BACKEND, with a one-line note on the data it assumes.
7. **A numbered frame index** continuing round 1's ids (s01…), so we can refer to frames by number in review.

Use realistic fixture data throughout: full tracking numbers (`FLE0636178718SG`), real-looking addresses, long names that wrap, a 40-stop route as well as a 5-stop one, and at least one right-to-left frame.

## 8. How we'll work

We will iterate. Start with the concept note and the home, sign-in and core delivery flow. Once those are right, extend the same language to everything else. If something in this brief is contradictory or a rule gets in the way of a better design, tell me and propose the alternative.
