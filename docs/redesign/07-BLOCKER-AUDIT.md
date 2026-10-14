# Tier 3 blocker audit — the ledger against `routes.php`

Two blockers turned out to be stale one slice at a time, so this checks all of
them at once, against the **179 routes actually registered on the public `v1`
namespace** rather than against the plan they were written from.

The ledger's Tier 3 table was written from `01-AUDIT.md` and the phase plan.
That is a statement of what the *plan* said was missing, not of what the server
serves. Several entries name an endpoint that was never built and miss one that
does the same job under another name.

**Result: 8 of 19 blocked slices are wrong or overstated.** Two are already
built. Six more are buildable now.

---

## Wrong — the capability is on the public namespace

| Slice | Ledger said blocked on | What is actually there |
|---|---|---|
| **Stop execution** (R1 s08/s19) | per-activity required-proof in `order-configs` | `require_pod` and `pod_method` were always published; `POST orders/{id}/capture-{signature,qr,photo}/{subjectId?}` and `GET {id}/proofs` are public. **Built — signature verified end to end.** |
| **My vehicle**, read half (R2 E1) | `assign-vehicle` public, odometer | `GET /v1/vehicles/{id}` is public and the driver record names the assignment. **Built.** |
| **Edit destination** (R2 D2) | `PATCH orders/{id}/waypoints` | `POST\|PATCH /v1/orders/{id}/set-destination/{placeId}` — a different name for the same job. The order's payload already carries its waypoints and their place ids. |
| **Change vehicle** (R2 E2) | `GET /v1/vehicles?available=1` | `GET /v1/vehicles` is public, and `status` is on every record, so "available" is a client-side filter over data we already receive. Assignment is **not** blocked either: `PUT /v1/drivers/{id}` accepts `vehicle: vehicle_xxx` — validated in `CreateDriverRequest` and applied in `DriverController@update`. |
| **Arrive out-of-geofence** (R2 C6) | geofence events surfaced to the app | `GET /v1/geofences/events` and `GET /v1/geofences/driver/{driverId}/history` are both public, with driver and order eager-loaded. |
| **Optimise preview** (R2 B3) | `POST /v1/drivers/{id}/optimize-route` | `POST /v1/orchestrator/run` and `/commit` exist, and the controller's own docblock calls itself "Public consumable API for FleetOps orchestration". Request and response shapes still need reading before building; the *capability* is not blocked. |
| **Maintenance & work orders** (R2 E6) | `maintenance-schedules` public | Full public CRUD for `work-orders` (plus `{id}/send`), `equipment` and `parts`. Only the *schedule* half is missing; work orders themselves are not blocked. |
| **Failed delivery / exception** (R2 C1) | `POST /v1/orders/{id}/exception` + reason codes | Probably the wrong shape to ask for. A config's flow is a graph, and a failure path is expressible as an activity — the seeded config already branches `enroute → [completed, failed]`. `update-activity` is public, so an exception may be an ordinary transition rather than a new endpoint. **Needs a product decision, not necessarily an endpoint.** |

---

## Genuinely blocked — nothing on the public surface does this

| Slice | Needs |
|---|---|
| Route list + map, manifest list, stop detail, resequencing | `manifests`, `manifest-stops` — no route of any kind exists |
| DVIR (E3a–d), inspection history (E4) | `inspection-templates`, `POST /v1/inspections`, `vehicles/{id}/inspections` |
| Duty: break + HOS card | `drivers/{id}/hos-status`, `active-shift`, `shift/start\|end\|break` |
| My documents (A6), documents & receipts (F1) | `drivers/{id}/documents`, file attach to order |
| Notification inbox detail (G4) | `GET /v1/notifications` |
| Devices & sessions (A5) | `GET\|DELETE /v1/drivers/{id}/sessions` |
| Chat attachments (G2) | `POST /v1/files` |
| Ad-hoc offers (D1) | offer expiry/claim semantics |
| Earnings (H2) | no earnings, payout or rate data exists in FleetOps at all |

---

## One hazard found on the way

`PUT /v1/vehicles/{id}` **accepts an odometer and silently discards it.**
`odometer` is in the model's `$fillable`, and the request rules do not forbid
it, but `VehicleController::vehicleInputFromRequest()` builds its input with
`$request->only([...])` and that list has no `odometer` in it. So the write
returns 200, the response looks right, and nothing changed.

That is the same shape as O-1 — an input the API accepts, ignores, and reports
success for. It is filed as **O-19**. The My vehicle screen's claim that
entering an odometer is unavailable is therefore correct, but for a sharper
reason than "no endpoint": the endpoint is there and drops the field.

---

## What this suggests about the ledger

The blocked list was written once, from the plan, and then trusted. Every entry
in the first table above was checkable in a few minutes against `routes.php`,
and three of them describe endpoints that were **never going to be built under
that name** because the capability already shipped under another one.

Worth re-running this audit whenever the server moves, rather than treating a
blocker as permanent because it was true when written.

---

## Owner's direction — second pass (recorded so it is not re-litigated)

The blockers were re-scoped by the owner. Recording the decisions here because
several of them change what "blocked" means:

| Area | Direction |
|---|---|
| **Geofence** | A socket event already fires. `GeofenceEntered`/`Exited`/`Dwelled` broadcast on `driver.{public_id}` and `driver.{uuid}` — **the app simply is not listening**, because v3 has no socket wiring at all. Not a backend gap. |
| **Work orders / maintenance** | A work order is an active job sent to a vendor for work on an asset; maintenance is the log of completed ones. Most of it lives on the dispatch side. A **driver** should be able to file issues (which dispatch turns into work orders), and to *view* maintenance completed on their vehicle and work orders scheduled for it. |
| **Route / optimise** | The orchestrator is for operators allocating and optimising orders, which produces a manifest. **The Route view must not use it.** Route shows the driver's already-assigned stops, and lets the driver optimise *those*. New endpoints welcome. |
| **Inspections** | **Hold.** Not released in FleetOps yet — WIP in fleetbase/fleetops#267. Lands after the official release. |
| **Driver shifts / HOS** | Established in the console; the consumable API may not exist and may need creating. |
| **Notifications** | Provided by core-api; a consumable API for managing them may need creating, in both core-api (general) and fleetops (driver-specific). |
| **Driver documents** | Exists, driven by driver onboard settings per organisation. Settings and API likely need expanding — document type and similar. |
| **Files / chat attachments** | core-api already has `ChatAttachment` with a `File` relation, and the APIs appear to exist. Check and expand rather than build. |
| **Ad-hoc offers** | Not a gap: orders with `adhoc: true` should raise offers over socket and push, Uber/DoorDash style, which the driver accepts. |
| **Earnings** | Needs real work: a wallet exists via the ledger module, but computing a driver's earnings needs per-organisation settings in fleetops (a share of the service rate, or the whole fee). Deferred. |
| **O-13 password** | Confirmed a security matter. Fixed — [fleetops#304](https://github.com/fleetbase/fleetops/pull/304). |

**Standing instruction:** where fleetops or core-api needs a change, make it and
open a PR against `dev-v0.6.61` (fleetops) for review. Cross-check
<https://fleetbase.io/docs> and the module source as you go. The goal is not a
reskin: it is an expansion and refactor to a standard Navigator can compete on.

---

## PRs opened against `dev-v0.6.61`

| PR | What |
|---|---|
| [#304](https://github.com/fleetbase/fleetops/pull/304) | **Security.** A driver's password could be set through a general update with no proof of the old one. Dedicated change / forgot / reset endpoints; `update()` no longer accepts `password`. |
| [#305](https://github.com/fleetbase/fleetops/pull/305) | **Driver manifests.** The models were complete but every endpoint was console-only, so a driver could be assigned a route with no way to read it. Read, run and re-sequence, narrow by design — creating and cancelling stay internal. |

Earlier, merged into the release branch: [#300](https://github.com/fleetbase/fleetops/pull/300) (order-config flow graph), [#301](https://github.com/fleetbase/fleetops/pull/301) (odometer discarded), [#302](https://github.com/fleetbase/fleetops/pull/302) (driver filter aliases).

### On the driver-side optimise

Built as a nearest-neighbour walk over OSRM road distances rather than a call
into the orchestrator, because the orchestrator allocates orders across a fleet
and produces manifests — a dispatch concern — while this reorders the stops of
one manifest already assigned. The heuristic is named as a heuristic in the code
and in the PR; it is typically a large improvement on an arbitrary order and is
not optimal, and saying otherwise would be a claim the implementation cannot
support.
