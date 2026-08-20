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
| 3 | **Edit payload item** — server-declared editable fields | R1 s07 | `orders/{id}/editable-entity-fields`, `PUT /v1/entities/{id}` |
| 4 | **Item detail** | R2 D4 | `entities/{id}` |
| 5 | **Order timeline** | R2 D5 | `tracking-statuses`, order activity |
| 6 | **Fuel log list + detail + create** | R1 s09, R2 F2 | `fuel-reports` CRUD, `fuel-transactions` |
| 7 | **Issues list + detail + create** | R1 s10, R2 F3 | `issues` CRUD |
| 8 | **Inbox: conversation, composer, participants** | R2 G1/G3, gap G2 | `chat-channels` + send/read/participants |
| 9 | **Account home** | prototype | `drivers/{id}`, `organizations` |
| 10 | **Org switcher** | R2 A3 | `drivers/{id}/organizations`, `switch-organization` |
| 11 | **Profile edit** | R2 A7 | `PUT /v1/drivers/{id}` |
| 12 | **Sign in + OTP** | R2 A1, R1 s15 | `drivers/login`, `login-with-sms`, `verify-code` |
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
