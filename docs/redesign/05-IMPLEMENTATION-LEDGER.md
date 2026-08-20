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
| 6 | **Fuel log list + detail + create** | R1 s09, R2 F2 | `fuel-reports` CRUD, `fuel-transactions` |
| 7 | **Issues list + detail + create** | R1 s10, R2 F3 | `issues` CRUD |
| 8 | **Inbox: conversation, composer, participants** | R2 G1/G3, gap G2 | `chat-channels` + send/read/participants |
| 9 | **Account home** | prototype | `drivers/{id}`, `organizations` |
| 10 | **Org switcher** | R2 A3 | `drivers/{id}/organizations`, `switch-organization` |
| 11 | **Profile edit** | R2 A7 | `PUT /v1/drivers/{id}` |
| ~~12~~ | **Sign in** — DONE (password); OTP still TODO | R2 A1, R1 s15 | `drivers/login` verified live |
| 13 | **Navigation hand-off picker** | R2 D6 | client only |
| 14 | **Permissions primer** | R2 A2 | client only |
| 15 | **Self-hosted connection** | R2 A4 | client only |
| 16 | **Sync queue screen** | gap I1 (undesigned) | client only — reads `useQueue()` |
| 17 | **Error states set** | gap I2 (undesigned) | client only |

**Today (R1 s01/s12)** — build after 1–2. Ships degraded: next-stop, progress
and ETA work from tracker data; the drive-time, break and inspection strips are
BLOCKED on Tier 3 and must render their "not enabled" variant until then.

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

## Open defect — text inputs never take focus

**Reproducible on the simulator against the live instance.** Tapping any text
field — the Orders search box — produces no caret, no focus ring, and no
keyboard, so nothing can be typed anywhere in v3.

**Not the test environment.** The simulator has a hardware keyboard attached,
so *no* software keyboard appears anywhere — including in iOS Spotlight. But
Spotlight shows a caret on tap and accepts injected text normally, so focus and
text injection both work at system level. In v3 there is no caret and no focus
ring, which is the real signal; the missing keyboard is a red herring, and
judging by the keyboard alone would be another stale-evidence mistake.

Ruled out by bisection, each verified on device against the live instance:

| Suspect | How it was excluded |
|---|---|
| The remount bug above | Reproduces after the fix, while taps, scrolling and navigation all work on the same screen |
| Native permission alert / LogBox toast | Screenshot taken immediately before the tap, screen clear |
| `react-native-screens` | Reproduces with `enableScreens(false)` |
| Tamagui `Input` / the `Field` wrapper | Reproduces with a bare RN `TextInput` substituted into `Field` |
| `BottomSheetModalProvider` | Reproduces with the provider removed |
| `GestureHandlerRootView` | Reproduces with it replaced by a plain `View` |
| `<Toasts>` overlay | Reproduces with it removed |
| Library versions | rngh 2.32, bottom-sheet 5.2.14, reanimated 4.5.1, rn-screens 4.25.2 — all current for RN 0.86 |

Still unexamined: `PortalProvider`, `SafeAreaProvider`, `TamaguiProvider`/`Theme`,
`NavigationContainer`, and the v2 provider chain in `App.tsx` (`ConfigProvider`
→ … → `ChatProvider`) that wraps `DriverBridge`.

Two things worth doing before bisecting further, because either would cut the
search in half:

1. **Run v2 and try its text fields.** v2 shares the same native config and most
   of the same providers. If v2 also cannot focus, this is not a v3 defect at all
   and the search moves to the native/podfile layer.
2. **Check whether it is screen-specific.** Every observation so far is from the
   Orders search box. Confirm on a second screen with a field — sign in, reached
   by logging out — before continuing to treat it as app-wide.

Until this is fixed, no slice with a form can be verified end to end on device:
sign-in, search, edit item, fuel log and issue capture are all affected.

## Known follow-ups

- **`orderStatuses.*` in en.json is now generated from the registry's design
  labels.** It said "Driver en-route" where the design says "En route", and the
  catalogue silently won over the registry. If a status label changes, change it
  in `palette.ts` and re-sync the catalogue — not the other way round.
- **The component library still carries English literals.** `OfflineBanner`
  ("You're offline — work is saved on device"), `SyncedBanner`, and the queue's
  `describeMutation` labels predate the i18n layer. `ErrorState` was fixed while
  building Orders (it now takes `retryLabel`); do the rest the next time a slice
  touches them, or as a dedicated pass before cutover.

- `isConnected` still proxies off the SocketCluster connection; there is no
  netinfo dependency. Decide whether to add one before Tier 1 lands.
- `getTheme` should be lifted out of `src/utils/index.js` so v3 can share the
  v2 formatters instead of `src/v3/format.ts` duplicating two of them.
- Gemfile pins CocoaPods 1.14.3, which cannot install on this machine (`nkf`
  will not build on Ruby 2.7.4) and is below RN 0.86's floor. Update the
  Gemfile and add a `.ruby-version`.
