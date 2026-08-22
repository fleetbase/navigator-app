# Defect register

Everything found while rebuilding the driver app, in one place for review.

Kept because most of these were **invisible until the app ran against a live
instance** — fixtures had ids where the API returns null, and a screenshot
cannot tell you a text field focused and was blurred again in the same tap.

**Status:** `OPEN` needs a decision or backend work · `FIXED` done in this branch
· `NOTED` real, deliberately not fixed here.

**Severity:** `S1` blocks the app or loses data · `S2` breaks a feature ·
`S3` wrong or misleading output · `S4` cosmetic or hygiene.

---

## Open — needs your decision

| # | Sev | What | Where |
|---|---|---|---|
| O-1 | **S1** | `driver_uuid` and `driver_assigned` are **silently ignored** as filters on `fuel-reports` and `issues`, returning *every driver's* records in the company. Only `driver=` filters. An unrecognised filter should 400, not fall through to the whole table — one plausible-looking parameter name is a cross-driver data leak. | fleetops API |
| O-13 | **S1** | `PUT /v1/drivers/{id}` accepts `password` and **sets it without verifying the current one**. Anyone holding an unlocked handset — or any client that can reach the endpoint with the driver's token — can take the account. The app therefore offers no password change at all; it needs a server-side current-password check first. | `DriverController@update` |
| O-14 | S3 | Email uniqueness is enforced **only on create**: `Rule::when($isCreating, [Rule::unique('users')…])`. A profile update can therefore set an email that already belongs to another user. | `CreateDriverRequest` |
| O-15 | S2 | **`NSContactsUsageDescription` is declared, and `Contacts` is in the Podfile's `setup_permissions`, but the driver app has no contacts feature.** Shipping an unused permission with a vague reason ("for sharing") is an App Store rejection risk and an unnecessary privacy ask. Removing it needs a `pod install` and a native rebuild, so it is left for a deliberate pass. | `ios/Podfile`, `Info.plist` |
| O-16 | S4 | Two keys in `Info.plist` are **not real iOS keys** and do nothing: `NSLocalUsageDescription` (notifications need no purpose string) and `NSUserAuthenticationUsageDescription`. Harmless, but they read as coverage that is not there. | `Info.plist` |
| O-12 | S3 | `react-native-config` bakes `.env` into the **native build**, not the JS bundle, so the platform token only reaches the app after a native rebuild — a Metro restart is not enough. Worth knowing before the next credential change looks like it did nothing. | tooling |
| O-2 | S2 | Fuel report `type` is on the resource but **not writable** — a create sending `"diesel"` returns `type: null`. The design's fuel-type picker has no backing. | `FuelReportController` |
| O-3 | S2 | Fuel reports have **no station field** at all, and the resource carries no receipt/photo association. Two more designed fields with nowhere to go. | `FuelReport` model |
| O-4 | S2 | `source`, `provider`, `fuel_provider_transaction_uuid`, `meta` and `report` are `isInternalRequest()`-gated on the fuel resource, so a driver cannot see **fuel-card match state** or the **reason a report was rejected**. | `Http/Resources/v1/FuelReport` |
| O-5 | S2 | `GET issues/{id}/timeline` exists only under the console's `int/v1` prefix, so the driver app cannot show an issue's **status history**. | `fleetops/routes.php` |
| O-6 | S3 | Creating an issue through the public API sets **no `status` and no `issue_id`** — both come back null, so a freshly filed issue has no state and no human-readable reference. | `IssueController@create` |
| O-7 | S2 | Chat **attachments** need `POST /v1/files` plus a picker; not built, so the composer is text-only. Camera / file / location share from G2 are all outstanding. | app + core-api |
| O-8 | S3 | A chat channel carries **no order reference**, so G1's order-context header has nothing to link to. | core-api |
| O-9 | S2 | `linkApp` finds the first admin user, gets-or-creates an `ApiCredential`, and ships it in a deep link — one shared, org-wide, unrevocable key on every handset. Phase 5 replaces this. | `NavigatorController@linkApp` |
| O-11 | S4 | `isConnected` still proxies off the SocketCluster connection; there is no netinfo dependency, so "offline" means "socket dropped". | `src/v3` bridge |

---

## Fixed in this branch

### The two that made the app feel broken

| # | Sev | What | Fix |
|---|---|---|---|
| F-1 | **S1** | **Every text field in v3 was unusable** — no caret, no keyboard, nothing typeable, sign-in included. The focus ring was a variant on the element wrapping the input, and changing the style of *any ancestor* of a focused `TextInput` makes it resign first responder. The field focused and blurred inside the same tap. | Ring moved to an absolutely-positioned sibling; the frame holding the input is constant by contract. `ad45f53` |
| F-2 | **S1** | **The whole content area appeared dead to touch** — taps and scrolling both. Screens were built during render (`component={placeholder(...)}`, `const Orders = () => …`), so every parent render produced a new component type and React remounted the entire subtree, destroying scroll position, keyboard focus and in-flight touches. Chrome kept working because chrome is not remounted. | Every screen declared at module scope; screen-scoped values travel by context. `4a9b842` |

Both were misdiagnosed first — see *How these were found*, below.

### Live-API shape defects

| # | Sev | What | Fix |
|---|---|---|---|
| F-3 | S2 | `entity.id` is **null on every entity** a live instance returns; identity is in `internal_id`. Produced `PUT entities/null`, and gating the row's `onPress` on `.id` made the item and edit screens **unreachable**. | `entityIdOf()`. `4a9b842` |
| F-4 | S3 | `order.tracking_number` is an **object**, not a string — `String()` rendered `[object Object]` where the design's identifier belongs. | `trackingNumberOf()`. `bc8345b` |
| F-5 | S2 | `order.order_config` is a **bare id string**, not `{ id }` — reading `.id` returned undefined, so the config-driven activity stepper was **silently dead**. | `orderConfigIdOf()`. `bc8345b` |
| F-6 | S3 | Money is stored in **minor units as a string** (`"7325"` SGD = $73.25). Rendering it raw is 100× too high; writing a driver's "73.25" straight through is 100× too low. | `formatMoney()`, and ×100 on create. `d223cb1` |
| F-7 | **S1** | The SDK's `Resource` defines a getter for **`id` only** — every other attribute needs `getAttribute()`. `driver.user` was silently undefined, so chat believed the driver was in no conversation: own name in every title, every message rendered as someone else's, sending disabled. | `getAttribute('user')`. `f8a1900` |
| F-8 | S2 | `available-participants` returns **User** records (the user id *is* `id`, no `user` key), while channel participants are `chat_participant_*` records that do have one. Reading `.user` listed the driver as someone to message themselves, and would have posted `add-participant` with no user. | `personUserId()`. `f8a1900` |
| F-9 | S3 | The chat channel `title` is **already computed per viewer** and excludes the person asking. Rebuilding it from participants put the driver's own name back into every row. | Use the server's title. `f8a1900` |

### Credentials

| # | Sev | What | Fix |
|---|---|---|---|
| F-21 | **S1** | `App.tsx` passed **`FLEETBASE_KEY` — the organisation's admin-scoped API key — into the adapter's `platformToken` slot**. That is the credential the audit flagged as the security hole, being handed to the pre-auth code path. | Passes `FLEETBASE_PLATFORM_TOKEN`. `ConfigContext` now resolves it. |

### Toolchain

| # | Sev | What | Fix |
|---|---|---|---|
| F-33 | S2 | **`bundle install` could not produce a CocoaPods capable of building this app.** The Gemfile asked for `cocoapods >= 1.13` while pinning `xcodeproj < 1.26.0`, and a CocoaPods new enough for RN 0.86 requires `xcodeproj >= 1.28.1` — the two constraints had no common solution. Resolution fell back to CocoaPods 1.14.3, which predates `visionos` platform support, and **13 podspecs in node_modules declare a visionos target**, so `pod install` died on "Unsupported platform". This is why the working toolchain had to be installed outside bundler entirely. Compounded by `ruby '>= 2.6.10'`, which permits 2.7.4 — where CocoaPods' `nkf` C extension will not build, failing with an error that never mentions Ruby. | Floors raised to `ruby >= 3.1` and `cocoapods >= 1.16`; the contradictory xcodeproj pin removed and its version left to CocoaPods; `.ruby-version` added. Verified: the lock resolves to CocoaPods 1.17.0 with xcodeproj 1.28.1, `bundle check` passes, and `bundle exec pod ipc spec` parses the visionos podspec that used to fail. |

### iOS permission strings

| # | Sev | What | Fix |
|---|---|---|---|
| F-24 | S2 | **The camera prompt told drivers the wrong reason.** `NSCameraUsageDescription` read *"This app may need to use your camera for your profile picture"* — the camera is for proof-of-delivery photos and barcode scanning. Seen on device while verifying the primer. Both photo-library strings were equally vague. Purpose strings are what the driver reads at the one moment they decide, and App Review requires them to be accurate. | All three rewritten to say what the app actually does. **Needs a native rebuild to take effect.** |

### Error handling

| # | Sev | What | Fix |
|---|---|---|---|
| F-29 | S2 | **Ten screens told the driver "Check your connection and try again" for every failure**, whatever had gone wrong. That is right for a dropped request and actively misleading for the rest: after a 403 it sends someone to retry what can never succeed, and after a 401 it hides the one action that would fix it. Each screen also offered a Retry button regardless, including where retrying is pointless. | `describeError` classifies ten kinds by *what the driver should do*, and `FailureState` renders the wording and the matching recovery. No button is offered where retrying cannot help — a dead Retry teaches drivers to distrust the ones that work. 20 near-duplicate strings removed. |

### Layout

| # | Sev | What | Fix |
|---|---|---|---|
| F-25 | S3 | **Pre-auth screens rendered under the notch.** Everything else sits inside `DriverShell`, which supplies the top safe-area inset — sign-in and the new connection screen do not, and the connection screen's title collided with the Dynamic Island. Sign-in had been papering over it with a hardcoded `paddingTop`, which happens to clear the island on this device and would not on others. | Both now read `useSafeAreaInsets()`. Seen on device; no test would have caught it. |

### Localisation

| # | Sev | What | Fix |
|---|---|---|---|
| F-30 | S3 | **The component library shipped fourteen English strings that no locale could change** — the offline and synced banners, the offer card's Accept/Decline and PAYOUT, TRACKING NUMBER, the HOS gauge's DRIVE LEFT / Shift / Week, the scanner's Manual entry, and the PICKUP/DROP-OFF/RETURN chips. Invisible in every test, because the tests asserted the same English back. | All routed through `t()` under `ui.*`. `no-hardcoded-copy.test.js` parses the sources rather than rendering — a string only reachable in a state no test exercises is exactly the one that survives. |
| F-31 | S3 | **Two plurals were built by hand** — `` `${n} ${n === 1 ? 'item' : 'items'}` `` in `OrderCard` and `StopRow`. That construction cannot be translated at all: languages with more than two plural forms have no way to express it. The guard above caught the second one, which my own grep had missed. | `t('ui.itemCount', { count })`, with the catalogue owning pluralisation. |

### Design fidelity — found by the four-scheme pass

The plan's verification gate asks for every screen in all four schemes. Doing it
found three things that had survived the entire build, because the simulator's
system scheme is light: **every screenshot I had called "dark" was of a light
app.**

| # | Sev | What | Fix |
|---|---|---|---|
| F-34 | **S2** | **Every one of the twenty screens painted the platform background, not the theme's.** A bare `<ScrollView style={{ flex: 1 }}>` shows the default behind its content, so in dark, night and sunlight the page stayed light wherever content did not cover it — section headers, the space under a short list, beside a card. | `useScreenStyle()` reads the token; a source-parsing guard keeps new screens honest. |
| F-35 | **S2** | **The theme picker had collapsed into unusable slivers**, so the theme could not be changed at all. Every option inside `Segmented` is `flex: 1`, but the group had no width of its own, and Settings wrapped two groups in one row. No test noticed, because all the options were still present in the tree. | `width: 100%` on the group, and the two groups stacked rather than wrapped. |
| F-36 | S3 | **Picking Night or Sunlight lit up "System" instead.** Settings coerced both to `'system'` before handing the value to the control, so the choice looked like it had not taken. | Each group shows a selection only when the current theme is one of its own options. |
| F-37 | S3 | Settings was almost entirely **untranslated** — every section header, row label, theme and unit option — and `NAV_APPS` never gained `uber` after it was added to the hand-off, so a driver whose default was Uber saw a blank row. | Routed through `t()`; the labels now come from the hand-off's own list. |

### Status contrast — measured, then fixed

The night pass raised this as a design question. Measuring it turned it into an
accessibility defect with a number attached.

| # | Sev | What | Fix |
|---|---|---|---|
| F-38 | **S2** | **Every one of the eleven status hues failed WCAG AA as text on light and sunlight backgrounds** — from 3.91 down to **1.78** for `on_hold`; six were below 3.0, which fails even the large-text threshold. The hues were authored against dark grounds, where they score 4.5–10.6, and reused unchanged everywhere else. Sunlight is the worst place to lose contrast, being the scheme meant for reading in direct sun. The code comment asserted the opposite — that the full-strength hue *"clears AA on both the tinted fill and the scheme background, which is what lets a single token serve every scheme"* — and that claim was simply untrue. | `statusFamily` now takes the scheme, and `legibleOn()` walks each hue toward black or white **only as far as the threshold demands**. The design's colour identity survives — a hue that already passes is returned untouched, and fill and border keep the original, since a 12% tint is decoration rather than text. A test asserts all 44 status/scheme combinations, reading the **resolved theme tokens** rather than the source hues, since the source hues are exactly what looked fine and was not. |

The night-vision concern from the earlier pass is now partly answered too: on the
night ground the hues already clear AA comfortably, so `legibleOn` leaves them
alone. Whether they should additionally be *desaturated* at night — the palette
warns that saturated green reads as a light source — remains a design call, and
is the only part of this still open.

### Design fidelity### Design fidelity

| # | Sev | What | Fix |
|---|---|---|---|
| F-22 | S2 | **Every card, row and sheet in the app carried a fully opaque shadow.** `elevation` is an Android style prop, but Tamagui also treats it as a *shorthand* and expands it into shadow props of its own — so a token written `shadowOpacity: 0.12, shadowRadius: 2` **resolved to `shadowOpacity: 1`, radius 3**. The UI read as much heavier than the design draws it, and it looked deliberate, which is why it survived several device passes. Reported by the user, not caught by me. | `elevation` key removed from the tokens and from `Button`'s elevated variant; `ui/__tests__/elevation.test.tsx` asserts the **resolved** opacity in all four schemes. |

The general lesson is now a rule in the loop prompt: **specified is not
resolved.** A style library can rewrite what you wrote, so when a visual
property matters, render the component and read the style back rather than
trusting the source. Reading the resolved style found this in one run, after
several passes of looking at screenshots did not.

Android note: `shadowOpacity` alone draws nothing there. When Android is in
scope, set elevation through a prop the style system does not rewrite rather
than re-adding the key.

### Connectivity

| # | Sev | What | Fix |
|---|---|---|---|
| F-32 | **S2** | **The app believed it was online, always.** `isConnected` defaulted to `true` and `App.tsx` never passed it, so every offline affordance built across this rebuild — the offline banner, the "showing what is saved on this device" state on ten screens, the sync-queue notice — could not appear on a real handset. The ledger described this as "proxies off the socket"; it was not proxying off anything. | Connectivity is now judged from whether our own requests reach the API. Deliberately **not** netinfo: a handset can show full signal while the API is unreachable, and the driver only cares whether their work can reach dispatch. The queue also flushes when reachability recovers, rather than only on mount. |

**Device verification outstanding.** The transitions are covered by adapter
tests, but seeing the banner on a handset needs the API to actually go away,
which means briefly stopping the server. This closes together with the sync
queue's populated states in the plan's offline pass.

### Offline queue

| # | Sev | What | Fix |
|---|---|---|---|
| F-26 | S3 | **`useQueue` served a stale snapshot whenever an item changed in place.** Its stability check compared `pendingCount`, `failedCount`, `isFlushing` and `items.length` — none of which move when a retry takes `attempts` from 1 to 2 and sets `lastError` while the item stays pending. The sync-queue screen exists to show exactly that, and would have shown it frozen. | A monotonic `revision` on the snapshot; `useQueue` compares that alone. |
| F-27 | S3 | **Snapshots were not immutable.** `items: [...this.items]` copies the array but shares every object, so a later retry rewrote a snapshot already handed out — including the one React was rendering from, which `useSyncExternalStore` requires to be stable. | Items are copied, not just the array. |
| F-28 | S3 | **Queued work was labelled `"POST issues"`.** The adapter's default describer was `` `${method} ${path}` ``, which is fine in a log and useless on the screen a driver reads to decide whether to wait for signal or discard something. | `describeMutation` maps paths to driver-facing names, and stores a *key* rather than a translated string — the label is written at enqueue and read much later, so freezing English would survive a language change. |

| # | Sev | What | Fix |
|---|---|---|---|
| F-23 | **S1** | **An organisation switch that failed on transport was queued and replayed later.** The queue exists so work done in a basement survives, which is right for a stop completion — but replaying a *session* change moves the driver between organisations twenty minutes later, unasked, possibly mid-job somewhere else. Sign-in had the same exposure: a queued credential replayed after the fact. | `NEVER_QUEUE` in the adapter covers switch-organization, login, logout, verify-code and switch-vehicle; they fail loudly so the screen can say so. Found by a test asserting a failure was *reported*, which instead found it silently queued. |

### Status registry

| # | Sev | What | Fix |
|---|---|---|---|
| F-10 | S3 | `describeStatus` fell back to the **tone's** label when a status had no translation, so a draft fuel report read **"Created"**, a rejected one **"Failed"**, an approved one **"Completed"**. 41 of 54 statuses were affected. | All 54 given their own label; a test asserts every registry status has one. `d223cb1` |
| F-11 | S3 | `open` and `resolved` were **missing from the registry** entirely, so live issues fell to the fallback tone. Neither appears in `src/constants/Enums.ts`, which is what the coverage test reads — statuses seen on the wire count as much as declared ones. | Added. `02e7a13` |

### Component library

| # | Sev | What | Fix |
|---|---|---|---|
| F-12 | S2 | `BottomSheetSelect` rendered **nine rows of `[object Object]`** for an ordinary `{label, value}` list — without an explicit `optionLabel` it fell back to `String(item)`. | `labelOf`/`valueOf` resolvers. `02e7a13` |
| F-13 | S3 | The same select showed the **raw value** after choosing — the trigger read "VEHICLE" once the driver picked "Vehicle". | Resolve value → label. `02e7a13` |
| F-14 | S3 | Its trigger **collapsed and clipped its own label**: it is a Tamagui `Button` and the Waypoint config carries no `size` scale for it to read a default from. | Explicit height matching `Field`. `02e7a13` |
| F-15 | S3 | `Banner`'s `meta` took its full intrinsic width, so a long one **squeezed the message out of existence**. | `flexShrink` on meta. `02e7a13` |
| F-16 | S4 | A stray `console.log` fired on **every select render**, left from the v2 port. | Removed. `02e7a13` |
| F-17 | S4 | Quick replies were three equal-width buttons; "Running 10 min late" truncated to "Runnin…", and a translation could be worse. | Content-sized buttons in a scroller. `f8a1900` |

### Behaviour

| # | Sev | What | Fix |
|---|---|---|---|
| F-18 | S2 | The fuel list was a **snapshot from whenever the tab was opened** — a fill logged through the app did not appear on return. | Navigator counts arrivals; list refetches on focus. `d223cb1` |
| F-19 | S3 | The issue create screen was a **native modal**, which sits above the app's portal hosts, so its select's bottom sheet rendered *behind* the form and never appeared. | Pushed, not presented. `02e7a13` |
| F-20 | S4 | A freshly filed issue has `status: null`, which rendered an **empty status pill**. | Says "Not yet triaged". `02e7a13` |

### Order detail — found walking the screen, not reading it

| # | Sev | What | Fix |
|---|---|---|---|
| F-39 | **S2** | **An order whose config declares no activity flow rendered no stepper, no explanation and no advance button** — the screen's entire purpose disappeared into blank space. The render had three branches for two conditions: a flow, or a failed config. Config *loaded but empty*, and config *still loading*, both fell through to `null`. A driver on such an order cannot progress it and is told nothing about why. | The two silent cases are now distinct and visible: a skeleton while the config is in flight, and a warning naming the cause and the remedy ("ask dispatch") when the config carries no flow. |
| F-40 | S3 | **"0 items" appeared twice on an empty order** — once as the section's meta and again as the empty state, because both used the count string. | The empty state says what is true rather than repeating the number. |

Both were invisible to the existing suite, which only ever mocked a config with a
flow in it. The tests added alongside cover the empty-flow config and assert the
count string appears exactly once.

### A server that answers nothing at all

The dev instance stopped responding mid-session — the container accepted the TCP
connection and then sent no byte, ever. That is not an exotic state; it is what a
stalled worker pool, an overloaded box or a half-open cellular NAT all look like
from the handset. It exposed two defects that a server which is cleanly *down*
would never have surfaced.

| # | Sev | What | Fix |
|---|---|---|---|
| F-41 | **S1** | **No request in the app had a timeout, so an unresponsive server hung it indefinitely.** `fetch` has no default timeout. The promise never settled, so nothing threw, reachability never flipped, and the driver sat in front of a skeleton that would spin until the app was killed — with no offline banner, no error, and no queueing, because the code path that decides "queue it" is the one that never ran. Every offline affordance built in this branch was dead in exactly the case a driver is most likely to meet. | A 20s `AbortController` deadline on every request. A timeout is reported as a **transport** failure, so it flips reachability, raises the banner and queues the mutation — the same path as a hard network failure, which is what it is. Verified on the live hung instance: skeleton → offline banner → cached content, and the test drives an abort under fake timers rather than trusting the shape. |
| F-42 | S3 | **Two offline banners, stacked, saying the same thing in different words** — the shell's "You are offline — work is saved on this device" and directly beneath it the screen's "Offline — showing the last update saved on this device." Nine screens did this. The design has one banner, in the shell. | The shell states the fact; a screen may only add what happens to work *started there*. The nine read-screen restatements are gone (and their strings with them); the write screens keep theirs, because "your message will be sent when you're back online" is not something the shell can say, and the two pre-auth screens keep theirs because the shell is not mounted yet. |

The timeout is the more serious of the two by a wide margin, and it was found
only because the server misbehaved rather than failing. A test suite mocking
`fetch` rejection proves the offline path works; it cannot prove the offline path
is ever *reached*.

### A require cycle at the root of the config

Reading the app's own console — over the Metro inspector, since the on-screen
LogBox notice only says "open the debugger" — turned up a warning that had been
firing on every launch and that nobody had looked at.

| # | Sev | What | Fix |
|---|---|---|---|
| F-43 | S3 | **`navigator.config.ts → config/default.js → utils/config.js → utils/index.js → navigator.config.ts`.** The barrel imported the config file and the config file's dependencies led back to the barrel, so whichever module evaluated second received a half-initialised namespace. It worked only because every value in the ring is read inside a function body rather than at module scope — one top-level read added anywhere in it would have produced an `undefined` at start-up with no obvious culprit. | Two leaf modules with no imports back into the ring: `utils/array.js` for the coercion helpers `config/default.js` needed, and `utils/navigator-config.js` for the config reader. Neither is re-exported from the barrel, since that would restore the import. Ten call sites updated; the warning is gone from the console at launch. |

---

## The tracker is more honest than the app was using

Not a defect, but the reason Today could be built without faking anything.
`GET /v1/orders/{id}/tracker` already reports its own limits, and the screen
defers to it rather than deciding for itself:

- **`lifecycle.show_live_eta` / `show_start_eta`** — the server says which ETA is
  meaningful. A dispatched-but-not-started order has an estimated *start*, not an
  arrival; choosing client-side would put a confident arrival time on a job
  nobody has begun.
- **`insights.is_location_stale`** and `warnings[]` — the instance answered with
  a driver position **42,850 seconds old**. Any estimate drawn from that has to
  be labelled, and the screen only warns when a number is actually on screen.
- **`capabilities`** — traffic, per-leg ETA, map matching and route geometry are
  declared per deployment, so the Route tab can adapt rather than assume.
- **`insights.is_delayed` / `is_off_route`** — the delay and off-route signals
  the design asks for already exist.

Worth reading before building the Route tab in Phase 4b.

## Self-inflicted, worth recording

While wiring the OTP bridge I **emptied `App.tsx`**. The edit script opened the
file with `io.open(p, 'w')` — which truncates immediately — and then threw on a
typo before writing anything back, leaving a zero-byte file. Nothing was lost
because it was committed, and `git checkout` restored all 130 lines, but the
same script against an uncommitted file would have destroyed the work.

Edits now write to a temp file and `os.replace` it over the original, so the
replacement exists before the original goes. Worth keeping in mind for any
scripted edit: truncate-then-write has no safe failure mode.

## Noted — real, not fixed here

These are v2 defects found while auditing. v3 supersedes the code they live in,
so they are recorded rather than repaired — but they are real, and they matter
if v2 ships again before cutover.

| # | Sev | What |
|---|---|---|
| N-1 | S2 | `OdometerNumber` does `value = value ? 0 : value`, zeroing every non-zero value. This is why v2's dashboard tiles always read 0. |
| N-2 | S2 | `BottomSheetSelect` (v2) calls `isObject()` **without importing it** — a guaranteed `ReferenceError` on object options — and its `filteredOptions` memo self-references in TDZ. |
| N-3 | S2 | `DriverMarker` / `VehicleMarker` both do `const movementData = { data }` then reassign it — a `TypeError` on any event carrying `location.coordinates`. Both also `console.log` on every socket tick. |
| N-4 | S2 | `CUSTOM_COLORS*` overrides in `tamagui.config.ts` are **inert**: the spreads sit before the semantic definitions, so no env override can change a token. This blocks the white-labelling the design promises. |
| N-5 | S2 | `OrderManagerContext` builds an MMKV key from a **second-precision** timestamp, so the `ordersToday` subscription is torn down and rebuilt every second, always reads undefined, and orphans a key per second. |
| N-6 | S3 | Hooks are called inside navigator `options` callbacks in five places, re-running on every navigation state change. |
| N-7 | S3 | `DriverLayout` navigates to a `ChatList` route that does not exist (`ChatHome` does). |
| N-8 | S3 | `tabBarLabelStyle` is a function where a style object is expected and references an undefined `focued`; it silently never runs. |
| N-14 | S4 | `use-storage.ts` had a real type error — `typeof x === 'function'` cannot narrow its setter union, because `T` may itself be a function type. It had never been caught because v2 is not typechecked; it surfaced the moment v3 imported far enough to pull the file into the graph. Fixed, since it was blocking. |
| N-13 | S2 | v2's `switchOrganization` swallows every failure into a `console.warn`, so a driver whose switch failed is never told. It also `console.log`s the new driver **and its token** — a credential in the device log. |
| N-9 | S4 | `src/hooks/use-locale.ts` imports a `setLanguage` that `localize.js` does not export. |
| N-10 | S4 | v2 lint reports **595 errors** (pre-existing; v3 is clean). |
| N-11 | S4 | The component library still carries English literals in `OfflineBanner`, `SyncedBanner` and the queue's `describeMutation`. |
| N-12 | S4 | `getTheme` should be lifted out of `src/utils/index.js` so v3 can share the v2 formatters instead of duplicating two of them. |

---

## How these were found — and how two were nearly missed

Worth keeping, because the method mattered more than the fixes.

**F-1 cost twelve wrong guesses.** Twelve components were swapped out one at a
time — react-native-screens, the gesture root, the sheet provider, the toast
overlay, Tamagui's `Input`, the styled wrapper, the outer stack — and *every one
appeared to fail*, because in each case the field still focused and still
blurred. Substitution cannot distinguish "never focused" from "focused and
blurred": the two look identical on screen. Instrumenting the input settled it
in three runs — `measureInWindow` proved the frame was where it was drawn, touch
counters proved the tap arrived, `onFocus`/`onBlur` read `foc 1 blr 1`, and a
ref-callback counter read `mounts 1`, making it an explicit blur rather than a
remount.

> When a control looks dead, measure whether the event arrives before replacing
> anything.

**F-2 was cleared once on the wrong evidence.** An earlier pass called the touch
problem a false alarm because *the duty pill opened the duty sheet on the first
tap*. But the duty pill lives in the header, outside the navigator — it proved
the chrome was alive and said nothing about the content, which really was dead.

> Clear a defect with evidence from the part of the tree it was reported in.

**A tap that does nothing and a list that will not scroll are the same
symptom.** Scrolling needs no JS handler, so if scrolling is dead too, the cause
is structural — an overlay, or a subtree being remounted — not a missing
`onPress`.

**Fixtures agree with you; instances do not.** F-3 through F-9 were all invisible
under test fixtures, which had ids where the API returns null and strings where
it returns objects. Every one surfaced within minutes of pointing the app at a
real instance.
