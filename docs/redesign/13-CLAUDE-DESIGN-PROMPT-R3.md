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

**The bar: the best driver app on the market.** Not "good for logistics software". It should stand next to the best consumer apps for polish, motion and ease, and beat every driver app (Uber Driver, Amazon Flex, DoorDash Dasher, Onfleet, Samsara Driver, Motive) at the things drivers do all day. Look at what those do well and badly, and tell me where this design is deliberately better.

## 1. What is wrong with what we built

These are observations from using the current build on a phone. Each one is something the new mockups must fix.

- **There is no home screen before sign-in.** The first thing a driver sees is a bare login form. The app needs a proper opening screen: a welcome with real presence and **motion**, that says what this app is and whose it is, and leads into sign-in. Round 1's s13 was the right idea and too static. This is the first impression of the whole product.
- **The signed-in dashboard is thin.** "Today" is one card for the next drop-off and nothing else. Round 1's s01 had a route map, stop progress, vehicle and time-left cards; none of it carries the day. A driver opening the app mid-shift should know in two seconds: am I on duty, what is next, how is my day going, is anything wrong.
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
- **Offers (ad-hoc orders)**: an organisation can send a job out to nearby on-duty drivers instead of assigning it. Each driver gets it as an incoming offer and can accept or decline; the first to accept gets it and it disappears for the rest. Some offers carry a countdown. An accepted offer becomes a normal order in the driver's work.
- **Routes (manifests)**: a day's stops in sequence, with status, ETA and distance per stop; today, upcoming and past; stop detail; arrive, complete or skip a stop; automatic arrival by geofence; server-side re-optimisation of the remaining stops with a before/after.
- **Navigation hand-off**: to Apple Maps, Google Maps, Waze or Uber, with a remembered default. **There is no in-app turn-by-turn.**
- **Vehicle**: assigned vehicle details; changing vehicle; trailers (view); **inspections** from organisation-defined forms (checklist, defects with severity, photo and note, signature, a pass / unsafe result, history).
- **Reports**: fuel log (list, add, detail); issues (list, report with type, category, priority, description and location; detail).
- **Chat**: one-to-one and group channels with dispatch, customers and other drivers; messages with file attachments of any type (so photos, documents and recorded audio can all be sent); read receipts; unread counts; live delivery; a thread can be tied to an order. The current app only uses text, photos and quick replies.
- **Push notifications and live updates** over a socket while the app is open.
- **Offline queue**: actions taken offline are queued, shown, retried, and can fail individually.
- **Account**: profile edit, organisation switcher, settings (language, theme, units, default navigation app), help with diagnostics, sign out.
- **Platforms**: iOS, Android, and a web build shown as a phone-width column.

### Partial

- **Driver onboarding requirements**: organisations can define onboarding settings (for example required documents), but the app has no flow for them yet.
- **Earnings**: a wallet with a balance and transactions exists; it is off unless the organisation enables it.
- **In-app notification list** (round 1's s11 lower half): notifications arrive as pushes; a stored list is not confirmed.

### Being added (design these as real; they are planned backend work)

- **An order step can trigger an inspection or a maintenance request.** The organisation's order flow will be able to say, on any activity: "this step requires inspection form *X*" (for example a vehicle check before the first pickup, or a trailer or cold-chain check at a pickup), or "this step raises a work order" (for example reporting damage found at a drop-off). Inspection forms and work orders already exist on the platform; linking them to an order step is new. In the app, the inspection becomes part of that step, like proof of delivery does: the step cannot complete until it is done, and its result (passed, defects, unsafe) can change what happens next.

### Not in the backend (label NEEDS BACKEND if you use them)

- Hours of service, drive-time limits, planned breaks, shifts (round 1's "Drive time left" and "Planned break").
- Turn-by-turn instructions (round 1's s04 "Left onto Kings Road East").
- Masked customer phone numbers.
- Join codes and dispatcher-approved join requests (round 1's s14). Today a driver account is created by the organisation.
- Document upload with approval (round 1's s16), devices and sessions, maintenance and work orders for drivers.

## 5. Problems I want new thinking on

Round 1 didn't solve these, or the build showed the solution was not enough. Propose concepts; give me two options where the trade-off is real.

1. **The opening screen.** What a driver sees before they sign in. It should be animated and feel alive: a sense of movement, routes, a city waking up, whatever fits. Not a stock illustration and not a login form with a logo above it. It has to carry any client's brand (logo, colour) when white-labelled, load instantly, respect reduced-motion settings, and get a returning driver to sign-in in one tap. Give me two or three directions with the motion described frame by frame (or prototyped).
2. **The dashboard.** What is the right first screen after sign-in? It should adapt to the moment: before the shift (go on duty, vehicle check, what's assigned), during it (next stop with map, day progress, anything needing attention), between jobs (offers, what's scheduled), end of day (summary, sign off). It must also work for a driver with a route of 40 stops and one with single ad-hoc orders and no route at all.
3. **Routes and orders are two views of the same work.** A driver may have a manifest of stops, loose orders, or both. Round 1 gave them separate tabs. Is that right? Propose the information architecture and the tab bar, and show how one job looks from each side.
4. **The delivery itself, end to end.** From "next stop" to "done, next": navigate, arrive, the organisation's own steps, proof, exceptions (customer not there, refused, damaged, wrong address), completion, and the hand-over to the next stop. This is the core loop; it should take the fewest taps of any flow in the app.
5. **Maps everywhere they help.** Next-stop card, order cards, order detail, stop detail, route. Define the map language once: pins by state, the driver, the route line (done / current / upcoming), the fallback when there is no road route (a dashed straight line), light and dark tiles.
6. **First run and sign-in.** Welcome, phone number with country picker, code entry, the email alternative, forgot password, choosing an organisation when the driver has several, permission priming at the moment each is needed (location "always", notifications, camera), and the first-day checklist if the organisation has requirements.
7. **Linking to an instance.** Self-hosted operators run their own server. A typed address is not enough, because the app also needs that server's access token and live-update settings. The intended design: the operator's console shows a QR code (or sends a link); the driver scans it and the app is connected. Design that flow, including "connected to *X*", switching back, and failure. No typed credentials.
8. **Driving.** A glance surface for when the phone is in a cradle: next stop, ETA, one big action, hand-off to the driver's maps app. Night theme. No turn-by-turn unless labelled NEEDS BACKEND.
9. **Incoming offers.** The full ad-hoc flow, as good as the best ride-hail and delivery apps: an offer arrives (app open, app in the background, phone locked), the driver sees pickup, drop-off, distance from them, the route on a map, what it pays if the organisation shows that, and the time left to decide. Accept, decline, let it expire, lose it to another driver, and several offers at once. Then what happens next: the accepted job joins their work and they can start it. Design the sound-and-haptic moment too.
10. **Other interruptions.** A destination changed by dispatch, a message, an order taken away. How each arrives while the driver is doing something else, without losing their place.
11. **Inspections and maintenance inside a job.** A step in the order flow requires an inspection, or raises a work order. Show how a driver meets this mid-delivery without it feeling like a detour: the step explains why, opens the inspection in place, and returns them to the job. Show the three outcomes (passed, passed with defects, unsafe: the job cannot continue and dispatch is told) and the "report a problem that needs fixing" path that creates a work order with photos.
12. **Chat that works like a real chat app.** Drivers should not have to learn it. Bubbles, timestamps, delivery and read state, typing, photos and files with previews, **voice messages** (hold to record, slide to cancel, waveform playback, playback speed: essential for drivers who can't type), location sharing, quick replies, replying from a notification, and a clear link between a thread and its order. It has to be usable one-handed and in a moving vehicle's cradle.
13. **Offline and sync.** How the driver knows they are offline, what is queued, what failed, and what to do about it, on every screen and in one place.
14. **White-label.** Show the opening screen, sign-in and dashboard in the default brand and in two other brands (different colour, logo, radius) to prove the system holds.

## 6. Screens to cover

Every item needs its real states: loading, empty, error, offline, and the long-content case. Reuse one component vocabulary throughout.

**A. First run and access**
Animated opening screen (first launch, returning driver, white-label variant, reduced motion) · sign in by phone (country picker, validation) · code entry (resend timer, sent by email instead, wrong code) · sign in by email · forgot and reset password · choose organisation · link to an instance by QR · permission primers (location, notifications, camera; granted, denied with recovery) · first-day checklist (PARTIAL) · session expired · app update required.

**B. Dashboard**
Before shift · on duty with a next stop · on duty with nothing assigned · offers available · end of day · something needs attention (failed sync, inspection due, message) · going on and off duty (with the warning when stops remain).

**C. Work: routes and orders** (structure per your answer to §5.2)
Route list and map · today / upcoming / past · stop detail · re-optimise preview · order list (active, scheduled, completed, search, no results) · order card with map · order detail · order timeline · item detail · edit item · change destination · destination changed by dispatch · cash to collect · order removed or reassigned.

**D. Doing a stop**
Navigation hand-off and app picker · driving glance · arrive (automatic, manual, far from the stop) · step list for 2, 4 and 7 steps, including a choice of next step · scan (multi-scan, duplicate, unexpected item, manual entry) · photo (capture, review, retake, from library) · signature · review before completing · completed and next stop · a step that requires an inspection (start, in place, passed, defects, unsafe and job blocked) · a step that raises a work order · exception: reason, evidence, outcome (the reason list is LIVE as an issue report; structured outcomes are NEEDS BACKEND).

**E. Offers (ad-hoc orders)**
Incoming offer with the app open · as a push and on the lock screen · offer detail with map, pickup, drop-off, distance, countdown · accept and what happens next · decline · expired · taken by someone else · several offers at once · an offer arriving during a stop · the list of open offers · no offers.

**F. Vehicle**
My vehicle · change vehicle · trailers · inspection: start, checklist, defect capture, review and sign, result (passed, unsafe), history and detail · fuel log, add fill-up, detail · issues: list, report, detail.

**G. Chat**
Conversation list (unread, pinned dispatch, order threads) · conversation (text, photos, files, voice messages, location, quick replies, read state, order context) · recording a voice message (hold, lock, cancel, send) and playing one · attachment picker and previews · sending, failed and queued offline · new conversation and group members · reply from a notification · notifications (PARTIAL).

**H. Account**
Account home · profile edit · organisation switcher · settings · permissions status · earnings (PARTIAL; and absent when off) · help and diagnostics · sync queue (queued, syncing, failed, conflict) · sign out with unsynced work.

**I. System**
Offline bar and its states · toasts and banners · push notification designs (new order, offer, destination changed, message) · iOS Live Activity and Android ongoing notification for the active stop (NEEDS BACKEND is fine) · tablet and web layouts for the dashboard, route and order detail.

## 7. What to deliver

1. **A short concept note first**: the information architecture and tab bar you propose, the opening-screen directions, the dashboard concept, and what you changed from round 1 and why. I will react to this before the full set.
2. **An interactive prototype** of the core flows: animated opening screen → sign in → dashboard → route → a full stop with scan, photo and signature, including a step that requires an inspection → next stop → an incoming offer, accepted and started → a chat with a voice message → going off duty.
3. **Static frames for every screen in §6**, in dark and light, phone size (390 × 844), with the states listed. Night and sunlight for the dashboard, route map and driving.
4. **The component library** as its own page: every component with its states (default, pressed, focused, disabled, loading, error), including the map language, inputs (text, phone with country picker, code boxes, select, segmented, date), sheets, banners, cards, list rows, steppers, empty and error states, skeletons.
5. **Tokens**: colour by theme, type scale, spacing, radii, elevation, motion. Say which change under white-label.
6. **Each frame tagged** LIVE / PARTIAL / NEEDS BACKEND, with a one-line note on the data it assumes.
7. **A numbered frame index** continuing round 1's ids (s01…), so we can refer to frames by number in review.

Use realistic fixture data throughout: full tracking numbers (`FLE0636178718SG`), real-looking addresses, long names that wrap, a 40-stop route as well as a 5-stop one, and at least one right-to-left frame.

## 8. How we'll work

We will iterate. Start with the concept note, the animated opening screen and sign-in, the dashboard, and the core delivery flow. Once those are right, extend the same language to everything else. If something in this brief is contradictory or a rule gets in the way of a better design, tell me and propose the alternative.
