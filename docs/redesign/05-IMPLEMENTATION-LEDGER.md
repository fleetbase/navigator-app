# Implementation ledger

The loop reads this to pick the next slice and updates it on the way out.
Order within a tier is the priority order. Take the first `TODO` whose
blocker is clear.

Legend: `DONE` · `TODO` · `BLOCKED — <what it needs>`

---

## Tier 0 — foundation (complete)

| Slice | State |
|---|---|
| Waypoint theme, 4 schemes, white-label overrides | DONE |
| Status registry (45 statuses) | DONE |
| Component library + ports | DONE |
| App shell: header, duty control, offline strip | DONE |
| Navigation graph, 5 tabs, custom tab bar | DONE |
| Mutation queue, NavigatorAdapter, Fleetbase provider | DONE |
| Normalised order store + selectors | DONE |
| `NAVIGATOR_V3` cutover flag | DONE |
| H1 Settings (R2) + live theme switching | DONE |
| v3 i18n layer (i18n-js, plurals, interpolation) | DONE |

---

## Tier 1 — buildable on today's API

Endpoints all exist. No backend work required.

| # | Slice | Design | Endpoints |
|---|---|---|---|
| ~~1~~ | ~~**Orders list**~~ — DONE: segments, search, all states, units, verified on device | R1 s05/s18 | `GET /v1/orders` |
| ~~2~~ | ~~**Order detail**~~ — DONE: config-driven stepper (2/5/7 steps tested), optimistic offline advance | R1 s06 + correction 1 | as listed |
| ~~3~~ | ~~**Edit payload item**~~ — DONE: allowlist-driven, locks on failure, queues offline | R1 s07 | as listed |
| ~~4~~ | ~~**Item detail**~~ — DONE: photo, base64 barcode/QR, scan history via `tracking-statuses`, null-metadata rows omitted, verified on device | R2 D4 | `entities/{id}` + `tracking-statuses?tracking_number=` |
| ~~5~~ | ~~**Order timeline**~~ — DONE: chronological, paints from the order's embedded `tracking_statuses` then refreshes; null-island locations suppressed; no actor exists, and it says so | R2 D5 | embedded `tracking_statuses` + `tracking-statuses?tracking_number=` |
| ~~6~~ | ~~**Fuel log list + detail + create**~~ — DONE: list, detail, create; economy derived client-side; four designed fields have no backing and are omitted rather than discarded (see below) | R1 s09, R2 F2 | `fuel-reports` CRUD |
| ~~7~~ | ~~**Issues list + detail + create**~~ — DONE: list, detail, create with type→category taxonomy; location bridged from v2 because create requires it; status timeline is internal-only and says so | R1 s10, R2 F3 | `issues` CRUD |
| ~~8~~ | ~~**Inbox: conversation, composer, participants**~~ — DONE: channel list, feed with self/other/system bubbles, composer + quick replies, participant picker. Attachments and order-context not built (see below) | R2 G1/G3, gap G2 | `chat-channels` (core-api, not fleetops) |
| ~~9~~ | ~~**Account home**~~ — DONE: identity, organisation, assigned vehicle, links to everything under Account, sign out. Earnings omitted (no endpoint) | prototype | `drivers/{id}`, `organizations/current` |
| ~~10~~ | ~~**Org switcher**~~ — DONE: driver-scoped list, current marked, single-org state, failures reported. Not blocked on the platform token after all | R2 A3 | `drivers/{id}/organizations`, `switch-organization` |
| ~~11~~ | ~~**Profile edit**~~ — DONE: name, email, phone, city, country; sends only what changed; queues offline. No password change (endpoint does not verify the current one) | R2 A7 | `PUT /v1/drivers/{id}` |
| ~~12~~ | ~~**Sign in**~~ — DONE: password **and** one-time code. The server picks sms or email and says which; the screen reports whichever happened | R2 A1, R1 s15 | `drivers/login`, `login-with-sms`, `verify-code` |
| ~~13~~ | ~~**Navigation hand-off picker**~~ — DONE: Apple/Google/Waze/Uber, remembered default, browser fallback, none-installed state; verified opening Apple Maps on device | R2 D6 | client only |
| ~~14~~ | ~~**Permissions primer**~~ — DONE: location/notifications/camera, denied vs blocked kept apart, partial-location state, Settings hand-off; verified on device | R2 A2 | client only |
| ~~15~~ | ~~**Self-hosted connection**~~ — DONE: host verified unauthenticated via the root endpoint, no API key field, https enforced for remote hosts | R2 A4 | client only |
| ~~16~~ | ~~**Sync queue screen**~~ — DONE: failed-first ordering, reason shown, confirmed discard, retry; driver-facing labels replace "POST issues". Empty state verified on device; populated states are test-covered (see below) | gap I1 (undesigned) | client only — reads `useQueue()` |
| ~~17~~ | ~~**Error states set**~~ — DONE: ten failure kinds classified by what the driver should do, one `FailureState` used by all ten screens, 20 duplicate strings removed | gap I2 (undesigned) | client only |

~~**Today (R1 s01/s12)**~~ — **DONE, degraded as planned.** Next stop, the ETA the
server says is meaningful, progress, delay and off-route all come from
`orders/{id}/tracker`. HOS, drive time, planned break and vehicle inspection are
named individually as "Not enabled" rather than omitted, so the gap is legible
to a driver. Verified on device against the live instance.

---

## Tier 2 — needs SDK stores (Phase 2e)

`fleetbase-js` has no stores for issues, fuelReports, manifests, workOrders,
inspections, files, comments, chatChannels, orderConfigs, notifications. Tier 1
can reach these through `adapter` directly; add the stores when the Tier 3
routes land so both ship together.

---

## Tier 3 — BLOCKED on backend (plan Phase 4a)

> **Audited against `routes.php` — see [07-BLOCKER-AUDIT.md](07-BLOCKER-AUDIT.md).**
> This table was written from the phase plan, not from the server, and **8 of
> its 19 entries were wrong or overstated**: three name an endpoint that was
> never going to be built because the capability already shipped under another
> name. Two are now built. Six more are buildable today. Read the audit before
> trusting a row here.

Do not start these until the endpoint exists. Each names its blocker.

| Slice | Design | BLOCKED — needs |
|---|---|---|
| ~~Route list + map~~ | R1 s02/s03/s17 | **BUILT** on `GET /v1/drivers/{id}/manifests` + `GET /v1/manifests/{id}` (v0.6.61). See below. |
| ~~Manifest list~~ | R2 B1 | **BUILT** — today / upcoming / past segments |
| ~~Stop detail~~ | R2 B2 | **BUILT** — arrive / skip via `PATCH /v1/manifest-stops/{id}` |
| ~~Optimise preview~~ | R2 B3 | **BUILT** — the route named here never existed; it is `POST /v1/manifests/{id}/optimize`, per manifest, and it applies at once (no dry run) |
| Manual resequencing | R2 B4 | still no resequence endpoint — only the automatic optimise shipped |
| ~~Stop execution (dynamic steps)~~ | R1 s08/s19 | **NOT BLOCKED — the blocker was stale.** See below. |
| Failed delivery / exception | R2 C1 | `POST /v1/orders/{id}/exception` + reason codes |
| ID / age verification | R2 C2 | proof type extension |
| ~~Complete stop review~~ | R2 C4 | **BUILT** — gated on the order's `pod_required` + status; proof itself stays on the order |
| Proof of delivery record | R2 C5 | `orders/{id}/proofs` shape |
| ~~Arrive out-of-geofence~~ | R2 C6 | **BUILT** client-side (haversine, 120 m). Auto-arrive with undo still needs the geofence socket events wired |
| Duty: break + HOS card | R2, shell | `drivers/{id}/shift/*`, `hos-status` public |
| ~~My vehicle~~ | R2 E1 | **PARTLY STALE — viewing built.** `GET /v1/vehicles/{id}` is public and always was; only *changing* the vehicle and posting an odometer still need endpoints. |
| ~~Change vehicle~~ | R2 E2 | **NOT BLOCKED — built.** `GET /v1/vehicles` is public and assignment is `PUT /v1/drivers/{id}` with a vehicle public id. No new endpoint was ever needed. |
| DVIR E3a–E3d | R2 E3a-d | `inspection-templates`, `POST /v1/inspections` |
| Inspection history | R2 E4 | `GET /v1/vehicles/{id}/inspections` |
| Vehicle defects | R2 E5 | defect → work-order link |
| Maintenance & work orders | R2 E6 | `maintenance-schedules` public |
| My documents | R2 A6 | `POST /v1/drivers/{id}/documents` |
| Documents & receipts | R2 F1 | file attach to order |
| Ad-hoc offers | R2 D1 | offer expiry/claim semantics |
| ~~Edit destination~~ | R2 D2 | **NOT BLOCKED — built.** `POST\|PATCH /v1/orders/{id}/set-destination/{placeId}` is public; the ledger named an endpoint that was never going to exist. |
| Destination changed alert | R2 D3 | dispatch push payload |
| Notification inbox detail | R2 G4 | `GET /v1/notifications` |
| Devices & sessions | R2 A5 | `GET/DELETE /v1/drivers/{id}/sessions` |
| Earnings | not designed | no earnings data exists in FleetOps |

---

## Not designed at all

R2 was truncated at the read cap partway into H2, so these have no frames:
**G2 composer** (partially inferable from G1), **H2 earnings**, **H3 help**,
**H4 sign out**, and all of **section I** — sync queue, error states, push
notification designs, iOS Live Activity / Android foreground notification,
tablet layouts.

Build I1 and I2 from the design system directly (they are mechanical). The rest
need a design round 3 or an explicit decision to ship without them.

---

## Verifying against a real instance

`.env.dev` in the **main checkout** points at a live local Fleetbase
(`http://localhost:8000`) with working credentials. `.env*` is gitignored, so a
git worktree does not inherit it — copy it in and append `NAVIGATOR_V3=true`.
Running against it immediately caught two shape bugs that unit tests with
invented fixtures could not (see src/v3/data/accessors.ts).

Reaching the driver shell needs a **driver session**, which the company API key
does not provide. The instance has test drivers (`ava.driver.testing@example.test`,
`ken.driver.testing@example.test`) but their passwords are not in the repo.
Until a credential is available, screens behind the auth gate are verified by
test only.

## Device verification — read this before blaming the code

An earlier pass recorded a "touch input does not reach v3 components" blocker,
and a later pass called that blocker false. **Both were partly wrong, and the
way each was reached is the lesson.**

The first pass was right that something was broken but never located it. The
second cleared it on the evidence that *the duty pill opens the duty sheet on
the first tap* — but the duty pill lives in `AppHeader`, outside the navigator.
It proved the header was alive and said nothing about the screen content, which
was in fact dead: taps on the segmented control, the search field and every
order card did nothing, and the list would not scroll.

The actual cause was found later and fixed (see **Screen identity** below): the
tab and stack screens were being created during render, so React remounted the
entire content subtree on every parent render. Chrome kept working because
chrome is not remounted.

Two *environmental* obstructions are also real, and will produce the same false
signal again:

1. **A chain of native permission alerts.** react-native-background-geolocation
   raises three in sequence after sign-in — "use your location", then the
   always-allow escalation, then "Background location is not enabled". Each is
   a native modal that swallows every tap, and the later two appear *after* a
   delay, so a screenshot taken before them looks clear while the taps that
   follow are eaten. Dismiss all three before testing anything.

2. **The LogBox dev toast sits on top of the tab bar.** "Open debugger to view
   warnings" occupies roughly the same 54pt strip as the tabs, so a tap at the
   tab-bar coordinate hits the toast instead. Dev-only — LogBox does not exist
   in a release build — but it makes tab navigation untestable until dismissed.

Rules of thumb:

- Before concluding a control is broken, screenshot *immediately before* the
  tap, not several actions earlier, and confirm nothing is overlaying it.
- Before concluding a control is **fine**, exercise the control that was
  actually reported — and one inside the navigator's content, not just the
  header or tab bar. Clearing a defect with evidence from a different part of
  the tree is how the content-area remount survived a whole extra pass.
- A tap that does nothing and a list that will not scroll are the *same*
  symptom. Scrolling needs no JS handler, so if scrolling is dead too, the
  cause is structural — an overlay, or a subtree being remounted — not a
  missing `onPress`.

## Screen identity — never build a screen component during render

`component={...}` on a `Screen` is identity-compared. Any of these creates a new
component type on every parent render, and React responds by unmounting and
remounting the whole screen subtree:

```jsx
const Orders = () => <OrdersStack driverId={driverId} />;   // in DriverTabs
<Stack.Screen component={OrdersHome} />                      // defined in the parent body
<Stack.Screen component={placeholder('Today', P3)} />        // factory called in JSX
```

Nothing looks wrong in a screenshot — the tree re-renders with identical output.
What breaks is everything that depends on *continuity*: scroll position resets,
a focused input loses the keyboard, and a touch that began before the remount
never completes. It reads as "touch is broken".

`DriverTabs` now declares every screen at module scope and passes screen-scoped
values by context (`DriverIdContext`), never as a closed-over prop. `tabBar` is
exempt: it is a render prop, so a new function re-renders the bar instead of
remounting it — which is why the badge count may still be closed over.

## Fixed — the focus ring was destroying the focus it existed to show

Every text field in v3 was unusable: tapping produced no caret, no keyboard and
no typed text, anywhere, sign-in included. **Fixed.** Recorded here because the
cause generalises and the wrong conclusion was reached twice on the way.

**Cause.** `Field` drew its focus ring by toggling a `focused` variant on the
element wrapping the input, driven by the input's own `onFocus`. On iOS,
**changing the style of any ancestor of a focused `TextInput` makes it resign
first responder.** So the field focused and blurred inside the same tap. The
symptom — nothing happens when you tap — looks exactly like a dead control, which
is why substituting components got nowhere: it focused every time.

**What actually found it.** Instrumenting the input and reading the counters off
the screen, rather than guessing at candidates:

| Measurement | Reading | What it settled |
|---|---|---|
| `measureInWindow` on the field | `16,193 370x63` | The frame is where it is drawn — no touch/layout offset |
| capture + `onTouchStart` counters | `cap 1 tch 1` | The touch reaches the input |
| `onFocus` / `onBlur` counters | `foc 1 blr 1` | **It focuses, then is blurred at once** |
| ref-callback mount counter | `mounts 1` | An explicit blur, not a remount |
| Wrapper props held constant | `blr 0`, caret, typing, list filtering | The wrapper's style change is the cause |

Before that, twelve components had been swapped out one at a time — rn-screens,
the gesture root, the sheet provider, the toast overlay, Tamagui's `Input`, the
styled wrapper, the outer stack — and every one "failed", because each still
focused and blurred. **Substitution cannot distinguish "never focused" from
"focused and blurred"; only instrumentation can.** When a control looks dead,
measure whether the event arrives before replacing anything.

**The fix.** `Field` now separates the two concerns:

- **Frame** — the element containing the input — is *constant by contract*.
  Nothing in it may depend on focus or error state.
- **Ring** — an absolutely-positioned, always-mounted, `pointerEvents="none"`
  **sibling** — carries the border, colour and shadow that react to focus.

Changing a sibling is safe; changing an ancestor is not. The design's focused and
error treatments are unchanged, in all four schemes.

`src/v3/ui/__tests__/field-focus.test.tsx` guards the invariant by asserting the
frame's style is byte-identical before and after focus while the ring's is not.
Reintroducing the bug fails six of its nine tests.

The same rule applies to any future component that wraps a text input — the
scanner's manual-entry field, the composer, the odometer capture. Put reactive
styling on a sibling, never on a parent of the input.

## Fuel log — what the driver API cannot carry

Four things R1 s09 / R2 F2 ask for have no home on the driver-facing API, so the
screens omit them rather than collect data the server drops:

- **Fuel type.** `type` is on the resource but not writable — a create sending
  `"diesel"` returns `type: null`. Verified against the live instance.
- **Station name.** No column exists on `FuelReport`. Location *is* storable, so
  the pump's coordinates stand in for it.
- **Receipt photo.** Not on the resource; would need the files association.
- **Fuel-card match.** `source`, `provider` and `fuel_provider_transaction_uuid`
  are all `isInternalRequest()`-gated, so a driver token cannot tell a
  card-matched report from a hand-entered one. F2's "matched to card" state and
  its rejection *reason* are both invisible for the same reason.

If these matter, they are backend work: expose the four fields to the driver
token, and make `type` writable.

**Scoping trap.** `GET /v1/fuel-reports` filters on **`driver=<public id>`**.
`driver_uuid` and `driver_assigned` are silently *ignored* and return every
driver's fuel spend in the company. A test asserts the parameter name.

## Issues — what the driver API cannot carry

- **The status timeline is internal-only.** `GET issues/{id}/timeline` is
  registered under the `int/v1` prefix, so F3's "timeline of status changes"
  cannot be shown to a driver token. Detail shows filed/resolved timestamps and
  says the rest is unavailable.
- **`location` is required on create**, unlike fuel reports. v3 had no location
  source, so v2's tracking is bridged in through `App.tsx` (`LocationProvider` →
  `useDeviceLocation`) rather than starting a second consumer of the same
  hardware. With no fix the screen refuses to file **before** the driver writes
  anything, rather than bouncing off server validation afterwards.
- **The create endpoint sets no `status` and no `issue_id`.** A freshly filed
  issue comes back with both null, so the row says "Not yet triaged" instead of
  rendering an empty status pill.

**Scoping trap, again.** `GET /v1/issues` filters on `driver=<public id>`;
`driver_uuid` is ignored and returns every issue in the company. Same as
fuel-reports — assume it holds for every driver-scoped list until proven
otherwise, and assert the parameter in a test.

## Inbox — shapes worth knowing before touching chat again

Chat lives in **core-api**, not fleetops, under `/v1/chat-channels` with the
`fleetbase.api` guard the driver token already passes.

- **`feed` is pre-merged.** A channel returns one ordered array of
  `{ type: 'log' | 'message', data }`, so G1's self / other / **system** bubbles
  need no client-side merge. Logs carry both `content`
  (`"{subject.0.name} has …"`) and `resolved_content`; only the latter is fit to
  show.
- **Two different "person" shapes.** A channel's `participants` are
  `chat_participant_*` records with a separate `user` field. But
  `available-participants` returns **User** records, where the user id *is*
  `id` and there is no `user` key. Reading `.user` on those silently offered the
  driver a conversation with themselves and would have posted `add-participant`
  with no user. `personUserId()` resolves both.
- **Sending needs the participant id**, not a user or driver id —
  `POST {id}/send-message` takes `sender` = `chat_participant_*`, and 422s
  otherwise. The driver's own participant is found by matching `user`.
- **`title` already excludes the viewer.** A channel of Ron + 3 comes back to
  Ron titled with the other three, so the server's title is used as-is.
- **No bulk add-participant route** — the channel is created, then people are
  added one at a time, so a partial failure leaves a real channel.

**Not built, and why:** attachments (camera/file/location) need the upload half,
`POST /v1/files`, plus a picker — so the composer offers text and quick replies
rather than a button that does nothing. G1's order-context header has nothing to
hang on: the public channel resource carries no order reference.

## Queue semantics — worth knowing before changing the screen

The queue treats two failures differently, and the sync-queue screen is built
around the distinction:

- **Permanent (4xx, except 408 and 429)** — the item is parked as `failed` and
  the pass **continues** past it. A rejected entry does not strand everything
  behind it forever.
- **Transient (no response)** — the item goes back to `pending` and the pass
  **stops**, so ordering survives losing signal. This is the head-of-line
  blocking; it applies here and only here.

I had this wrong in an earlier note that described the blocking as general. A
test now pins both behaviours.

**Device verification of this screen is partial.** The empty state was verified
against the live instance. Producing genuinely failed entries needs the API to be
unreachable, which would mean stopping the user's server, so the populated
states — waiting, failed with reason, attempt counts, discard confirmation,
retry — rest on the 18 tests rather than a device run. Worth completing during
the offline pass in the plan's verification section, which airplane-modes a full
stop sequence.

## Known follow-ups

- **`orderStatuses.*` in en.json is now generated from the registry's design
  labels.** It said "Driver en-route" where the design says "En route", and the
  catalogue silently won over the registry. If a status label changes, change it
  in `palette.ts` and re-sync the catalogue — not the other way round.
- ~~**The component library still carries English literals.**~~ **DONE.** Every
  string in `src/v3/ui` now goes through `t()` under a `ui.*` namespace, and
  `ui/__tests__/no-hardcoded-copy.test.js` parses the sources to keep it that
  way. The queue's labels were fixed with the sync-queue slice (F-28).

- ~~`isConnected` still proxies off the SocketCluster connection~~ **DONE, and
  the premise was wrong.** It was not proxying off anything: `App.tsx` never
  passed it, so it defaulted to `true` and the app believed it was online
  always — every offline affordance in the app was unreachable (F-32).

  **Decision: no netinfo dependency.** Connectivity is judged from whether our
  own requests reach the API, which is the question a driver actually has. A
  handset can show full signal while the API is unreachable — captive portal,
  dropped VPN, DNS, or the server being down — and netinfo would report all of
  those as online. Transport failures measure the thing that matters, need no
  native module, and are testable. `isConnected` remains an override for a host
  that genuinely knows better.
- ~~`getTheme` should be lifted out of `src/utils/index.js`~~ **DONE.** It lives
  in `src/utils/theme.js`, so the barrel no longer imports `tamagui.config` and
  v3 can import the v2 formatters — proved by
  `src/v3/__tests__/shared-formatters.test.ts`. `src/v3/format.ts` keeps only
  what is genuinely different: the unit-aware `formatMeters`, and the money,
  weight and dimension formatters v2 has no equivalent for.
- ~~Gemfile pins CocoaPods 1.14.3~~ **DONE**, and the cause was worse than a
  stale pin: `cocoapods >= 1.13` and `xcodeproj < 1.26.0` are **mutually
  unsatisfiable**, because a CocoaPods new enough for RN 0.86 requires
  xcodeproj >= 1.28.1. `bundle install` therefore could not produce a working
  CocoaPods at all — which is why the toolchain had to be installed outside
  bundler to get the app building. Fixed, `.ruby-version` added, and
  `bundle exec pod --version` now answers 1.17.0.

---

## The four-scheme gate, and what walking it cost

Every v3 screen renders in all four schemes under test. That was never the
question — the tests had passed for weeks while the app was quietly wrong. What
the gate was for was walking the *running* app, screen by screen, in each
scheme, against a live instance.

**Walked in sunlight and dark, against real data:** Today, Orders, Order detail,
Account, Settings, Fuel log, Fuel report create, Issues, Issue detail, Inbox,
Conversation, Profile edit, Sync queue (empty), Permissions, and the Phase 4b
placeholders. Fifteen defects came out of it, F-39 through F-53, including the
two that mattered most: no request timeout, and an order config whose activity
array is not in workflow order.

**Not verified on the device, and why:**

- **Item detail.** Every order on the instance has an empty payload, so there is
  no entity to open. Covered by tests in all four schemes; not seen running.
- **OTP sign-in.** Reaching it means signing out, and exercising it means
  sending a real code to a real phone. Rendering was checked in all four schemes
  earlier in the branch; the send path is deliberately untested against the
  live instance.
- **The sync queue with items in it.** Queueing needs a transport failure, which
  needs the API to be unreachable. The two windows where it *was* unreachable
  were unplanned, and both closed before a write could be staged. The empty
  state and the offline banner were verified during them. The populated state
  rests on `queue.test.ts` and the screen tests alone — say the word and I will
  stage it against a briefly stopped server.

The pattern worth keeping: **a fixture agrees with whoever wrote it.** F-48 is
the sharpest example in the branch — every flow fixture listed its activities in
the order a person would naturally write them, so every test passed, and the
real config listed `completed` fourth and `dispatched` last.

---

## Gap spec H3 — Help and support

Built, with one part deliberately not built.

- **Contact dispatch** hands off to the Inbox. FleetOps has no separate support
  channel, and inventing one would put driver questions somewhere nobody reads.
- **Report a problem** files an `issue` under the organisation's own taxonomy
  (`Software Technical` → `Bugs`), so an app bug lands in the same queue as
  every other defect a driver reports, shows in the console, and queues offline
  like anything else. Verified end to end against the live instance.
- **Diagnostics** — build, platform, instance, driver id, queue depth,
  connection — are **shown on screen before the driver sends them**, and the
  copy says what is *not* attached. A button that quietly gathers context is a
  button that gathers whatever a later version decides to.
- **FAQ** is not built. No endpoint serves help content and no copy has been
  agreed; hardcoding a few questions would be inventing product. The row says so
  rather than being left out, so nobody wonders whether they missed it.

One thing that did *not* turn out to be a defect, worth recording because the
instinct was wrong: the Send button looked disabled to me on device even with
text in the field. Rather than log it from a screenshot, I measured the resolved
opacity — enabled is above 0.9, disabled below 0.6. The distinction is real and
I had misread a PNG. The measurement stayed as a test.

---

## Stop execution was not blocked, and had not been for a while

The ledger listed R1 s08/s19 as blocked on "per-activity required-proof in
`order-configs`". Reading the server rather than the ledger, none of it was
missing:

- `require_pod` and `pod_method` were **already** published by the public
  order-config resource — they were never among the fields `projectFlow()`
  dropped.
- All three capture endpoints are on the public `v1` namespace:
  `POST orders/{id}/capture-qr|capture-photo|capture-signature/{subjectId?}`,
  alongside `GET {id}/proofs` and `GET {id}/next-activity`.
- Every one accepts base64 rather than only multipart, which is what makes proof
  **queueable**: a signature captured in a basement is a string the queue can
  hold, not a file handle that has to be re-read after a restart.

So the slice was buildable, and is now built:

- `useProofCapture` maps the config's `pod_method` to the right endpoint and
  body, strips the data-URL prefix the signature pad emits (the endpoint runs a
  strict base64 decode that the prefix fails), and sends one request per scanned
  code because `capture-qr` takes a single `code`.
- `ProofCaptureScreen` renders only the method the config named — not the
  mockup's fixed scan → photo → sign sequence.
- Order detail routes through capture **before** the activity update, so an
  order is never marked delivered with nothing attached. A test asserts the
  update is not sent when proof is outstanding.

**Verified end to end on the device.** With the owner's go-ahead, `require_pod`
was set on the `started` activity with `pod_method: signature` on the dev
instance, and the whole path was walked: the order screen refused to advance and
offered proof instead, the signature pad took a signature, and the server
answered with a real proof record — `proof_lv6hmwbs7f`, signature PNG stored on
S3 — attached to that order. The config was then restored byte-for-byte from a
backup taken before the change.

The same run confirmed the fleetops PR is doing its job. With `activities`
published, the stepper reads the *real* graph — `created → dispatched → started
→ enroute → completed` — and offered **Mark Started**. The lifecycle fallback
had guessed `enroute` third. Both orderings are plausible; only one is the
customer's.

**Still not verified on device:** the scan and photo methods. The iOS simulator
has no camera, so neither can be exercised there at all — they need a handset.

**A design note worth keeping:** the capture dependencies are `require`d inside
their branches rather than imported at module scope. VisionCamera initialises
its native module on import and the signature pad drags in a WebView, so a
module-scope import made the *entire navigator* depend on three native binaries
— which is what first showed up as three test suites failing to load. A driver
whose flow needs no proof should not pay for a camera, and a test of the tab bar
should not need one either.

---

## My vehicle — the read half was never blocked either

Second stale blocker in a row, found the same way: by reading the routes rather
than the ledger. `GET /v1/vehicles/{id}` is public, and the driver record
already names the assignment, so a read-only vehicle screen needed nothing new.
What genuinely remains blocked is *changing* the assigned vehicle
(`assign-vehicle` is console-only) and entering an odometer reading — the screen
says both plainly instead of offering controls that would fail.

The resource returns about a hundred fields and a stock instance leaves most of
them null, so the screen asks for the handful a driver uses and drops the rest.
Two defects came out of putting it on a device — see F-57 and F-58 — and one
piece of design worth keeping: the odometer names its own source, because the
vehicle's recorded column is frequently null while a telematics box reports a
live figure, and a driver copying that number into a fuel report should know
which of the two they are looking at.

---

## Edit destination — third stale blocker, now built

The ledger had R2 D2 blocked on `PATCH orders/{id}/waypoints`. The capability
ships as `POST|PATCH /v1/orders/{id}/set-destination/{placeId}`, and has all
along.

The endpoint is well-shaped for this: `resolveServiceStopFromKey` accepts a
place uuid, a place public id, a waypoint uuid, a waypoint public id or a
waypoint's `place_uuid`, and answers **422** for anything not in the order's own
payload. So it is inherently scoped to this order's stops and the app does not
have to police that itself — which also settles what the screen should be. Not
free-text destination entry: a driver diverting to an address dispatch has never
heard of is a conversation, not a form field. What it offers is *which of this
order's own stops am I heading to*, which is the case that comes up when a
delivery has to be skipped and returned to.

Completed stops are listed but not selectable, and the stop already being headed
to is not re-sent.

**Offline it queues and says so, and deliberately does not fake the new state.**
Everything else on that screen — which stop is active, what is complete, the
sequence, the ETA — is the server's own computation over the payload. Rewriting
one field of it locally would show a view that is neither what the driver chose
nor what dispatch sees.

**Verified end to end against the live instance**, once the API came back. The
picker listed the order's two stops typed as Pickup and Drop-off with the
current one marked; choosing the drop-off moved the server's `active_stop` to
it, which Today then reflected as "Next drop-off"; choosing the pickup again
moved it back. The order was left exactly as it was found.

That pass turned up F-61 and F-62 — the order screen was naming the final
drop-off as the current destination, and its ETA and distance had never rendered
at all because they read a field this API returns as null.

---

## Change vehicle — fourth stale blocker, now built

The ledger wanted `GET /v1/vehicles?available=1` and a public `assign-vehicle`.
Neither exists and neither is needed. `GET /v1/vehicles` is public and scoped to
the session's company, and assignment is `PUT /v1/drivers/{id}` with the
vehicle's **public id** — `DriverController@update` resolves it against
`vehicles.public_id` for that company, so a driver can only ever be assigned a
vehicle in their own organisation. That was the constraint worth having, and the
server already enforces it.

Reuses `useUpdateDriver` rather than adding a second hook that PUTs the same
endpoint: assignment travels on the same request as a profile change because it
*is* the same request.

Vehicles that cannot be driven are shown greyed rather than hidden — a driver
hunting for yesterday's van should learn it is off the road, not wonder whether
the list is broken.

**Verification.** 14 tests. On the device the API was returning 502 throughout,
so the populated list and the write are **not device-verified**. What the run did
confirm: the 502 is classified as a server fault rather than as being offline,
the account links stay reachable through it (F-44), and the no-vehicle state now
offers the picker (F-60, found by looking at that state on the device).

---

## Route tab — the whole tab was a placeholder, and nothing it needed was missing

Five rows of the Tier 3 table above named the Route tab as blocked. Every
endpoint it needs shipped in v0.6.61 and was documented in the Postman
collection (fleetbase/postman #53, #57). Built in one slice: `RouteScreen`
(B1 + s02/s03), `StopDetailScreen` (B2 + C6), `StopExecutionScreen` (C4),
`OptimisePreviewScreen` (B3), a persisted `manifestStore`, `useManifests`,
`routeGeo`, and a `RouteMap` on react-native-maps — the first map in the v3 tree.

**What the API carries, and what the frames draw that it does not.**

- A manifest has **no name**. The vehicle and the date stand in for one;
  dispatch's `notes` are the subtitle. "Purbeck loop" in the frame is `notes`.
- A stop has **no time window** — only `estimated_arrival`. The window chip is
  absent rather than faked, and "finish ~17:05" is the last remaining stop's
  estimate when the server gave one.
- **Optimise applies immediately.** `POST /v1/manifests/{id}/optimize` rewrites
  `sequence` and returns the manifest; there is no preview or dry run. B3 asks
  the driver to confirm a before/after, so the proposal is computed client-side
  with the *same* nearest-neighbour walk the controller runs (`nearestFirst`,
  tested against the controller's rules: done stops stay in front, fewer than
  three pending is left alone), and the server is called only on Apply. Its
  answer replaces the manifest wholesale. Distances are straight-line and say so;
  time saved is estimated at the plan's own average speed and omitted without
  totals. A `dry_run` flag on the endpoint would let the preview be the server's
  own — a candidate FleetOps PR, not a blocker.
- **Optimise is in `NEVER_QUEUE`.** It re-sequences from a position; replayed an
  hour later it would reorder the route from wherever the driver was then.
- Stop updates (`arrived`, `completed`, `skipped`) **are** queueable and are
  reflected locally, so a route keeps moving in a basement. The arrival check is
  written into the stop's `meta` (`arrival_check`, `arrival_position`,
  `arrival_distance_m`) so dispatch sees a 340 m arrival as what it was.
- **C4's proof list is not drawn.** Proof belongs to the order and its config;
  the stop's completion is gated on `pod_required` + the order not being
  finished, and the way through is the order screen. Listing the captured proofs
  is the same read C5 needs and lands with it.
- Phone masking (correction 3) has no capability behind it; the place's `phone`
  is shown in full. Copy-to-clipboard has no dependency in the app; Share covers
  it through the system sheet.
- The planned break (s03) needs the HOS surface, still console-only.

**Verification.** 69 tests across `routeGeo`, `manifests` and `RouteScreens`;
all four screens in all four schemes. **Not device-verified** — the dev instance
has no seeded manifest for the test driver; seeding one is the first thing to do
before a road test.

---

## Internationalisation — the foundation, exercised end to end

The i18n layer existed but had never translated anything: one catalogue, a
read-only language row, a stored default (`en-GB`) that no catalogue was keyed
by, no device detection, no RTL. Built in one slice:

- **`translations/es.json`** — a full Spanish catalogue for every v3
  namespace (828 keys). `i18n/__tests__/locales.test.ts` enforces parity: every
  v3 key present, no extra keys, identical `%{placeholders}`, and a ceiling on
  strings identical to English. A new key without a Spanish string fails CI,
  which is the only way a second language stays complete.
- **Pseudo-locales, dev builds only.** `en-XA` accents and pads every string
  by ~30%; `ar-XB` does the same under a bidi override. Both are generated from
  `en` at boot (`i18n/pseudo.ts`) and never shipped. They are how invariant 7
  gets walked on every screen without a translator in the loop.
- **Device locale.** `language` now defaults to `'system'` and resolves through
  `react-native-localize` (`resolveLocale`: exact tag, then language subtag,
  then `en`). The stale `en-GB` default is rescued by language, not dropped.
- **A real picker** in Settings (H1), showing each language's own name, with a
  restart notice when the direction changes — RN applies `forceRTL` at the next
  launch, not in place.
- **RTL groundwork.** Every physical edge in the tree (`marginLeft`,
  `paddingRight`, `textAlign="right"`, absolute `left`/`right`) became a logical
  one (`marginStart`, `paddingEnd`, `endAlign()`, `start`/`end`), and every
  chevron goes through `chevron()`/`backChevron()` from `i18n/direction.ts`.
  Tab labels, which were English literals in `TAB_OPTIONS`, are keys.
- **Formatting follows the locale.** `formatClock`, `formatDateTime`,
  `formatDay`, `formatMoney` and the new `formatNumber` pass `currentLocale()`
  to Intl; the four screens that called `toLocaleString()` bare no longer do.

**Still open:** which real locales ship (owner's call — Spanish is a working
proof, not a decision); a translator's review of `es.json`; and the v2
namespaces, which are not translated because the v2 tree is what the cutover
flag replaces.

---

## Trailers — view built, management specified and waiting on a decision

No frame exists for trailers, so the treatment is written down first:
[09-TRAILERS-SPEC.md](09-TRAILERS-SPEC.md). Built to it: an *Attached
trailers* section on My vehicle (E1) listing the train in towing order — position
badge from `current_connection.position`, title, attachment pill, plate in full,
reefer range — and a `TrailerDetailScreen` with identity, towing, size and
weight, running gear, refrigeration and telematics groups, each omitted when
empty. Reads `GET /v1/vehicles/{id}/trailers` and `GET /v1/trailers/{id}`, both
already in the Postman collection (fleetbase/postman #58).

Attach, detach and reorder are specified in the same document and **not built**:
whether a driver couples trailers from the app is the owner's call (§12.1). The
spec also records that reorder has no atomic path — it is detach + attach — and
names the FleetOps PR (`position` on the active connection) to open before
building it. Coupling checks belong to the DVIR checklist, not to these screens.

---

## Earnings — H2, gated off by default, wired to the ledger

H2 is the point where R2 stops, so this is built from the gap spec's own words:
balance, period selector (week / month / all), transaction feed with type and
direction, payout status. `useWallet` reads `/ledger/v1/wallet/balance` and
`/ledger/v1/wallet/transactions` by absolute URL — the ledger mounts outside
`v1`, and the adapter gained `absoluteUrl()` so the same auth, timeout and
reachability apply. Minor units end to end; `formatMoney` once at the edge.

**Gated.** `features.earnings` travels host → `V3App` → `DriverTabs`
(`useFeatures`). Off, the Account row reads *Not enabled* and the route renders
`NotEnabledScreen`. On, the screen shows the wallet. The host reads
`FEATURE_EARNINGS` through `navigator.config`. It stays off until the ledger
credits drivers on completion — that PR (rate model, order-completion listener,
subject = Driver vs User) is still the open design question in §8a, and this
screen is the surface it will land on. **Not verified against a driver token**:
the dev instance has no driver credentials on this machine.

---

## The two remaining placeholders are now honest states

`NotEnabledScreen` replaces the build-time `Placeholder` for Documents and
Inspections (and gated Earnings): what the feature is, that the organisation has
not enabled it, and who to ask — in the driver's language, with nothing that
reads like data. `Placeholder.tsx` has no remaining users on the tab graph.
The unused **Contacts** permission is gone from the Podfile and `Info.plist`;
that lands with the next `pod install`.

---

## Inspections / DVIR — the app side, built against a contract still in review

E2 gate, E3a checklist, E3b defect capture, E3c review and certification, E3d
outcome, E4 history and its detail (carrying E5's defect view) are built.
The driver-facing API does not exist on any released FleetOps: it is being
added on `feature/inspections-driver-api` (fleetops#267 rebased — cleanly, zero
conflicts — plus the `v1` surface, tests against the 100% gate, and the Postman
collection), as a **draft PR for review**. Until it lands, an instance answers
404 and the hub renders the not-enabled state.

**Offline-first by construction.** `InspectionDraftStore` persists every answer
to MMKV the moment it is given; the checklist renders the draft and owns no
answer state. Photos are base64 (replayable across a cold start, as proof
capture proved). Submit goes through the adapter; queued, the draft becomes a
local receipt (`queued · will sync`) in the history until the server lists the
submission by `meta.client_key`.

**The body mirrors `PublicInspectionController@submit`** field for field
(`item_results[].{item_key,label,category,status,severity,passed,comments,photos}`,
`odometer`, `location`, `signature`, `attachments`) plus `inspection_form`,
`driver`, `vehicle`, `started_at` and `meta.source_app`. An unanswered optional
item is sent as passed; a not-applicable one as `status: not_applicable, passed:
true` — the server counts failures on `passed`.

**Rules from the frames, enforced in code:** a defect needs a severity, a note,
and a photo at high or above (`settings.photo_required_from` overrides); the
vehicle is unsafe at high or above, or when the driver ticks it; review blocks
submit until every required item is answered and the driver certifies, plus a
signature when `settings.require_signature`. The E2 gate is `onAssigned` on
Change vehicle: a confirmed swap lands on the hub with the required-inspection
banner. Failure consequences (issue, work order) are the server's config-driven
job; the outcome and detail screens show their identifiers when returned.

**Not device-verified**, and cannot be until the FleetOps PR is on an instance.

