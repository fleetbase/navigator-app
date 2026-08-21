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
| O-12 | S3 | `react-native-config` bakes `.env` into the **native build**, not the JS bundle, so the platform token only reaches the app after a native rebuild — a Metro restart is not enough. Worth knowing before the next credential change looks like it did nothing. | tooling |
| O-2 | S2 | Fuel report `type` is on the resource but **not writable** — a create sending `"diesel"` returns `type: null`. The design's fuel-type picker has no backing. | `FuelReportController` |
| O-3 | S2 | Fuel reports have **no station field** at all, and the resource carries no receipt/photo association. Two more designed fields with nowhere to go. | `FuelReport` model |
| O-4 | S2 | `source`, `provider`, `fuel_provider_transaction_uuid`, `meta` and `report` are `isInternalRequest()`-gated on the fuel resource, so a driver cannot see **fuel-card match state** or the **reason a report was rejected**. | `Http/Resources/v1/FuelReport` |
| O-5 | S2 | `GET issues/{id}/timeline` exists only under the console's `int/v1` prefix, so the driver app cannot show an issue's **status history**. | `fleetops/routes.php` |
| O-6 | S3 | Creating an issue through the public API sets **no `status` and no `issue_id`** — both come back null, so a freshly filed issue has no state and no human-readable reference. | `IssueController@create` |
| O-7 | S2 | Chat **attachments** need `POST /v1/files` plus a picker; not built, so the composer is text-only. Camera / file / location share from G2 are all outstanding. | app + core-api |
| O-8 | S3 | A chat channel carries **no order reference**, so G1's order-context header has nothing to link to. | core-api |
| O-9 | S2 | `linkApp` finds the first admin user, gets-or-creates an `ApiCredential`, and ships it in a deep link — one shared, org-wide, unrevocable key on every handset. Phase 5 replaces this. | `NavigatorController@linkApp` |
| O-10 | S4 | The Gemfile pins CocoaPods 1.14.3, which cannot install here (`nkf` will not build on Ruby 2.7.4) and is below RN 0.86's floor. No `.ruby-version`. | repo |
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

### Design fidelity

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

### Offline queue

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

---

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
