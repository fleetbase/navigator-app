# Trailers — specification against the Waypoint system

FleetOps v0.6.65 made trailers a first-class resource. Neither design round drew
them, so this is the written specification the screens are built to. It composes
existing components only; nothing here is a new visual treatment.

## Decisions taken, and the one still open

| Question (handover §12.1) | Taken here | Owner may change |
|---|---|---|
| Does a driver *manage* trailers or only view them? | **View only, shipped.** Attach / detach is specified below but not built. | Yes — say "build attach/detach" and it lands on the same screens. |
| Queue attach/detach offline? | Not applicable until built. When built: **no.** Attach refuses a trailer already on another vehicle, and a replay hours later would couple a trailer that has since moved. Same rule as `orders/{id}/start`. | Yes |
| Odometer / reefer-hours capture by driver? | **Read only.** Shown when the record carries them. No entry field. | Yes |

## What is built (view)

**My vehicle (E1) — "Attached trailers" section.** Below the vehicle's detail
rows, above *Change vehicle*. One row per trailer in towing order:

- **Position badge** — 40×40, `surfaceRaised`, the `current_connection.position`
  integer in tabular 17/800. A dot when the connection carries no position.
- **Title** — `display_name` → `name` → `code`, 15/700, one line.
- **Attachment state** — `StatusPill` on `attachment_state`, small, hue + shape.
- **Plate** — `Identifier`, unboxed, its own line, never truncated (invariant 1).
- **Reefer** — when `refrigerated`, a brand-tone micro line `Refrigerated · 2–8 °C`.
- Empty: a calm secondary line, *No trailer is attached to this vehicle.* Not an
  error state. Failed read: *Could not read the trailers on this vehicle.*

**Trailer detail** — pushed from the row, headed *Trailer*. Groups, each omitted
entirely when it has no data (invariant 8):

1. Identity card: photo, title, `type · body_type`, make/model/year, reefer line,
   attachment pill.
2. IDENTITY — plate, VIN, serial, fleet code, all `Identifier` rows.
3. TOWING — towed by, position in train, attached since, coupling type.
4. SIZE & WEIGHT — length, width, height, tare, GVWR, payload, cargo volume,
   in the record's `measurement_system`.
5. RUNNING GEAR — axles, tyres, doors, brakes, ABS, EBS.
6. REFRIGERATION — set range, reefer hours (only when `refrigerated`).
7. TELEMATICS — tracker online, last online, odometer, engine hours.
8. A neutral banner: *Coupling and uncoupling are recorded by dispatch. Report a
   coupling fault as an issue.*

Endpoints: `GET /v1/vehicles/{id}/trailers`, `GET /v1/trailers/{id}`. Both are
in the Postman collection (fleetbase/postman #58).

## Specified, not built — attach / detach / reorder

Built only when the owner says a driver manages trailers.

**Attach** — from My vehicle, *Attach a trailer* (secondary button). A picker
(`BottomSheetSelect`) over `GET /v1/trailers?attachment_state=detached`, each
option showing title + plate. Then a position stepper (1…n+1, default n+1) and
*Attach* (primary, 48dp). Calls `POST /v1/trailers/{id}/attach { vehicle,
position, source: 'navigator' }`.

- **Already attached elsewhere** (API refuses): a danger banner naming the other
  vehicle from `current_vehicle_name` and one action, *Ask dispatch to detach it*
  → Inbox composer. Never a raw error.
- **Position taken** (API refuses): the stepper marks that position and asks for
  another.

**Detach** — on trailer detail, *Detach* (destructive variant) with a confirm
sheet and optional note → `POST /v1/trailers/{id}/detach { notes }`.

**Reorder** — no update path exists: repositioning is detach + attach with a new
position, two calls, not atomic. A `PATCH /v1/trailers/{id}/position` (or
`position` on `PUT /v1/trailers/{id}` acting on the active connection) is the
FleetOps PR to open before building reorder; a two-call reorder that fails
half-way leaves a trailer on the ground.

## Coupling checks

Belong in the DVIR (E3). The inspection checklist's *coupling* area should list
each attached trailer by position and plate, so a pre-trip walks the train in
order. That is an inspection-form content decision, not a trailer screen.
