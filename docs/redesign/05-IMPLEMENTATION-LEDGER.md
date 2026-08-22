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

Do not start these until the endpoint exists. Each names its blocker.

| Slice | Design | BLOCKED — needs |
|---|---|---|
| Route list + map | R1 s02/s03/s17 | driver-scoped manifest endpoints |
| Manifest list | R2 B1 | `GET /v1/drivers/{id}/manifests` |
| Stop detail | R2 B2 | manifest stops |
| Optimise preview | R2 B3 | `POST /v1/drivers/{id}/optimize-route` |
| Manual resequencing | R2 B4 | `PATCH /v1/manifests/{id}/resequence` |
| Stop execution (dynamic steps) | R1 s08/s19 | per-activity required-proof in `order-configs` |
| Failed delivery / exception | R2 C1 | `POST /v1/orders/{id}/exception` + reason codes |
| ID / age verification | R2 C2 | proof type extension |
| Complete stop review | R2 C4 | required-proof declarations |
| Proof of delivery record | R2 C5 | `orders/{id}/proofs` shape |
| Arrive out-of-geofence | R2 C6 | geofence events surfaced to the app |
| Duty: break + HOS card | R2, shell | `drivers/{id}/shift/*`, `hos-status` public |
| My vehicle | R2 E1 | `assign-vehicle` public, odometer |
| Change vehicle | R2 E2 | `GET /v1/vehicles?available=1` |
| DVIR E3a–E3d | R2 E3a-d | `inspection-templates`, `POST /v1/inspections` |
| Inspection history | R2 E4 | `GET /v1/vehicles/{id}/inspections` |
| Vehicle defects | R2 E5 | defect → work-order link |
| Maintenance & work orders | R2 E6 | `maintenance-schedules` public |
| My documents | R2 A6 | `POST /v1/drivers/{id}/documents` |
| Documents & receipts | R2 F1 | file attach to order |
| Ad-hoc offers | R2 D1 | offer expiry/claim semantics |
| Edit destination | R2 D2 | `PATCH orders/{id}/waypoints` |
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

- `isConnected` still proxies off the SocketCluster connection; there is no
  netinfo dependency. Decide whether to add one before Tier 1 lands.
- ~~`getTheme` should be lifted out of `src/utils/index.js`~~ **DONE.** It lives
  in `src/utils/theme.js`, so the barrel no longer imports `tamagui.config` and
  v3 can import the v2 formatters — proved by
  `src/v3/__tests__/shared-formatters.test.ts`. `src/v3/format.ts` keeps only
  what is genuinely different: the unit-aware `formatMeters`, and the money,
  weight and dimension formatters v2 has no equivalent for.
- Gemfile pins CocoaPods 1.14.3, which cannot install on this machine (`nkf`
  will not build on Ruby 2.7.4) and is below RN 0.86's floor. Update the
  Gemfile and add a `.ruby-version`.
