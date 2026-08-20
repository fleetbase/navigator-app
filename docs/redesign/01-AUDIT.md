# Navigator App — Redesign Audit

Analysis of `navigator-app` against `core-api`, `fleetops/server`, and `@fleetbase/sdk` (fleetbase-js).
Basis for the Claude Design prompt in `02-CLAUDE-DESIGN-PROMPT.md`.

---

## 1. What the app is today

**Stack:** React Native 0.86 / React 19.2.7 · Tamagui 1.125.20 (Tailwind palette → themed tokens) · React Navigation 7 (static API) · MMKV · socketcluster-client · react-native-background-geolocation · react-native-maps · FontAwesome · `@fleetbase/sdk` 1.2.13.

**Two code generations live side by side.** `src/` is the current app (~19k LOC). `src/legacy/` + `legacy/` is the previous Tailwind/Redux generation — ~40 files, unreferenced by the active navigators, still shipped. Dead weight for both bundle size and comprehension.

**Navigation shape** — 5 config-driven tabs (`DRIVER_NAVIGATOR_TABS`):

| Tab | Screen | State |
|---|---|---|
| Dash | `DriverDashboardScreen` | Debug readout: tracking yes/no, raw lat/lng/heading/altitude, active order count, speed |
| Orders | `DriverOrderManagementScreen` → `OrderScreen` | Calendar strip + flat list; order detail is a 699-line monolith |
| Reports | `DriverReportScreen` | Tab switch between Issues and Fuel Reports only |
| Chat | `ChatHomeScreen` → `ChatChannelScreen` | Functional, visually unstyled |
| Account | `DriverProfileScreen` → `DriverAccountScreen` | Profile fields, org switcher, theme, language, clear cache |

**Stub screens shipped in the bundle:** `VehicleScreen`, `FleetScreen`, `DriverFleetScreen`, `TestScreen` — each renders a single `<Text>` with its own name.

### Auth and tenancy (today)

- Phone → SMS OTP (`drivers/login-with-sms` → `verify-code`), or OAuth (Apple/Google/Facebook via `use-oauth`), or `drivers/login` with identity+password.
- On success the server returns a driver payload carrying a **Sanctum personal access token**; the app stores it at MMKV `_driver_token` and then does `new Fleetbase(authToken ?? FLEETBASE_KEY)` — i.e. **the driver token is passed into the SDK slot meant for a company API key**. It works because `fleetbase.api` middleware accepts both, but it means the SDK has no concept of "app credential vs. user credential".
- Multi-tenant: `GET drivers/{id}/organizations`, `POST drivers/{id}/switch-organization` → new driver token scoped to the next company. Works, but every switch silently reinitialises the whole SDK and blows the order caches.
- **Bootstrap is the security problem.** `NavigatorController@linkApp` (internal) finds the *first admin user*, gets-or-creates an `ApiCredential`, and redirects to `flbnavigator://configure?key=<API_KEY>&host=…&socketcluster_host=…`. That company API key is then persisted in `INSTANCE_LINK_FLEETBASE_KEY` on every driver handset. One shared, long-lived, org-wide credential distributed to every device — with no per-device revocation and no scoping.

### Data layer

- `OrderManagerContext` keeps four MMKV-cached buckets (`allActive`, `allRecent`, `nearby`, `currentOrders` keyed by date) with `hasLoaded*Ref` one-shot guards; refresh is manual pull, a 15-min interval for current orders, 5-min for nearby, plus socket events `order.ready` / `order.ping` on channel `driver.{id}`.
- Every read deserialises the whole cached collection into SDK `Order` instances on each render (`restoreCollection` inside `useMemo` deps that change often) — a real render-cost problem on long lists.
- Issues and fuel reports bypass the SDK entirely: raw `adapter.get('issues', …)`. The SDK has **no store** for issues, fuel reports, manifests, work orders, files, comments, chat channels, or order configs.
- `useFleetbaseData` references an undefined `storefront` in its dependency array — the hook is effectively broken/unused.
- **No offline write queue, no optimistic mutation, no idempotency keys.** Every driver action is a bare network call; losing signal at a stop loses the action.

---

## 2. API surface that already exists

### Public `/v1` (middleware `fleetbase.api` — accepts API key *or* driver Sanctum token)

**FleetOps** (`fleetops/server/src/routes.php`):

- `drivers/` — `login`, `login-with-sms`, `verify-code`, `register-device`, `{id}/track`, `{id}/toggle-online`, `{id}/switch-organization`, `{id}/organizations`, `{id}/current-organization`, `{id}/simulate`, CRUD
- `orders/` — query/find/create/update, `{id}/start`, `{id}/dispatch`, `{id}/schedule`, `{id}/cancel`, `{id}/complete`, `{id}/update-activity`, `{id}/next-activity`, `{id}/tracker`, `{id}/eta`, `{id}/comments`, `{id}/set-destination/{placeId}`, `{id}/capture-signature/{subjectId?}`, `{id}/capture-qr/{subjectId?}`, `{id}/capture-photo/{subjectId?}`, `{id}/proofs/{subjectId?}`, `{id}/distance-and-time`, **`{id}/editable-entity-fields`**
- `entities`, `payloads`, `places` (+`search`), `issues`, `fuel-reports`, **`fuel-transactions`** (+`match-vehicle`, `match-order`, `review`), `vehicles` (+`{id}/track`), `fleets`, `contacts`, `vendors`, **`equipment`**, **`parts`**, **`work-orders`** (+`{id}/send`), `devices`, `sensors`, `zones`, `service-areas`, `service-rates`, `service-quotes`, `purchase-rates`, `tracking-numbers` (+**`from-qr`**), `tracking-statuses`, `labels/{id}`, **`order-configs`** (read-only flow projection)
- **`geofences/`** — `events`, `inventory`, `dwell-report`, `driver/{driverId}/history`
- **`orchestrator/`** — `run`, `commit` (public projection of the optimisation engine)
- `onboard/driver-onboard-settings/{companyId}` (public, by company public id)

**Core** (`core-api/src/routes.php`): `files` (+`base64`, `{id}/download`), `chat-channels` (+`send-message`, `read-message`, `add-participant`, `available-participants`), `comments`, `organizations/current`.

**Already platform-token-gated:** `GET /v1/organizations` → `OrganizationController@listOrganizations`, behind `fleetbase.platform-api`.

### Internal `/int/v1` — exists, but drivers cannot reach it

These are the crown jewels for the redesign and are currently console-only (session auth):

- **`fleet-ops/manifests`** + **`manifest-stops/{id}`** — `Manifest` / `ManifestStop` models: driver + vehicle + `scheduled_date`, `status` (`draft → active → in_progress → completed | cancelled`), `total_distance_m`, `total_duration_s`, `stop_count`, and ordered stops with `sequence` (VROOM-optimised), `estimated_arrival`, `actual_arrival`, `distance_from_prev_m`, `duration_from_prev_s`, `markArrived()`, auto-complete.
- **`drivers/{id}/hos-status`** — `daily_hours`, `weekly_hours`, `daily_limit`, `weekly_limit`, `hos_source`, `is_compliant` (FMCSA defaults 11h/70h, per-schedule overrides).
- **`drivers/{id}/active-shift`**, **`schedule-items`**, **`availabilities`**.
- `drivers/{id}/assign-vehicle` / `unassign-vehicle`.
- `orchestrator/` — `run`, `commit`, `preview`, `engines`, `order-config-fields`. Engines: `VroomOrchestrationEngine`, `RouteSequencingEngine`, `GreedyOrchestrationEngine`, `CapacityAllocationEngine`, `DriverAssignmentEngine`. Plus `Support/OSRM.php` (`getRoute`, `getTrip`, `getTable`, `getMatch`, polyline decode).
- `maintenance-schedules`, `maintenances` (+line items), `work-orders`, `parts`, `equipment`, `warranties`.
- `settings/` — `routing-settings`, `tracking-settings`, `entity-editing-settings`, `driver-onboard-settings/{companyId}`, `map`, `scheduling-settings`.
- `telematics` (Samsara/Flespi/Loconav/Fliit connectors), `positions/replay`, `analytics/*`.

### Platform API token (already built, barely used)

`Fleetbase\Support\PlatformApi`: `flb_platform_` + 64 chars, `Hash::make`'d into system settings, with `rotateToken()` / `revokeToken()` / `status()` and admin endpoints `GET|POST|DELETE int/v1/…/platform-api-token`. Middleware `fleetbase.platform-api` validates the bearer token and stamps `last_used_at`.

**It is a system-level, non-tenant credential** — exactly right for pre-auth surface (organisation discovery, invite redemption, login), and exactly wrong as a replacement for post-auth calls. Post-auth must stay on the driver's per-session Sanctum token, which already carries company scope.

### SDK (`fleetbase-js` 1.2.14)

Stores: `orders`, `entities`, `places`, `drivers`, `vehicles`, `vendors`, `contacts`, `serviceAreas`, `serviceQuotes`, `zones`, `fleets`, `organizations`. Order actions cover dispatch/start/complete/cancel/update-activity/set-destination/capture-*. Driver actions cover login/verifyCode/track/organizations/switchOrganization/syncDevice.

**Missing entirely:** issues, fuel reports, manifests, manifest stops, work orders, inspections, files, comments, chat channels, order configs, proofs, notifications. Constructor also throws on a `$`-prefixed key and treats the single credential as `publicKey` — no slot for "platform token + user token" as separate concerns.

---

## 3. Gap analysis — the eight requested items

| # | Ask | What exists | What's missing |
|---|---|---|---|
| 1 | Secure driver onboarding for orgs | `onboard/driver-onboard-settings/{companyId}`; `drivers/login-with-sms`; deep-link `linkApp` | Org discovery by join code/QR; invite + redemption; request-to-join with approval; document capture (licence, insurance); per-device credential; revocation. Today: one shared org API key on every handset |
| 2 | Platform token instead of API key | `PlatformApi` + `fleetbase.platform-api` middleware; `GET /v1/organizations` gated | App still ships/stores a company API key. No `/v1/onboard/*` under the platform guard. SDK has no dual-credential model. Driver token is passed as `publicKey` |
| 3 | Driver manifests | `Manifest`, `ManifestStop`, `ManifestController` — full model with VROOM sequencing | Zero public `/v1` exposure; no driver-scoped query; no start/complete/arrive from the app; no UI |
| 4 | Improved order/task list | Calendar strip + flat list of `OrderCard` | Stop-level (not order-level) list; sequencing; filters/search/sort; grouping; swipe actions; map/list toggle; progress; unified "today" surface |
| 5 | Routing + route optimisation | Orchestrator engines (VROOM/OSRM/greedy/capacity), `orders/{id}/tracker`, `/eta`, `distance-and-time`, `routing-settings` | No driver-initiated optimise; no waypoint reorder from app; no multi-order route view; navigation is a blind hand-off to Apple/Google/Uber |
| 6 | Vehicle management + change vehicle + vehicle issues | `vehicles` CRUD + `{id}/track`; `assign-vehicle` (internal only); `issues` supports vehicle context; `work-orders`, `maintenances`, `equipment`, `parts`, `warranties` | `VehicleScreen` is a stub. No assign/change from app, no vehicle detail, no odometer capture, no DVIR/inspection, no defect→work-order path |
| 7 | Improved UI/UX overall | Tamagui theme, dark/light | Dashboard is a debug panel; order screen is a 699-line monolith; forms are unvalidated modals; chat unstyled; no empty/error/offline states; no design system |
| 8 | Edit order + payload entity details | `orders/{id}/editable-entity-fields`, `entity-editing-settings`, `PUT /v1/entities/{id}`, `PUT /v1/payloads/{id}` | App reads entities read-only; no edit UI; entity-editing settings never fetched; no waypoint/place edit from order; no custom-field editing |

---

## 4. Competitor benchmark — standards we're missing

Sources at the bottom. Distilled to what a driver app is expected to have in 2026:

**Compliance & vehicle (Samsara, Motive)**
- Pre-trip / post-trip DVIR with a guided checklist, defect photos, notes, driver certification signature, and **offline completion that syncs later**. Defects route to maintenance.
- HOS clocks: drive / shift / cycle / break countdowns, pre-violation warnings, log certification. (`hos-status` already computes daily/weekly against limits.)
- Fuel card integration and lowest-price fuel finder (Motive "Savings Finder"). We have `fuel-transactions` + fuel provider connections server-side.

**Stop execution (Onfleet, Bringg)**
- Multi-type proof of delivery in one guided, non-skippable sequence: signature, timestamped photo, GPS coords, barcode scan, **age/ID verification**, notes.
- Multi-barcode scan per stop, optionally required — scan-to-load at depot and scan-at-stop.
- Chain of custody across handoffs.
- Failed-delivery / exception workflow with reason codes, evidence, reschedule, and customer notification.
- Geofenced auto-arrival and auto-departure driving status transitions.
- Planned breaks appearing inline in the stop list, with notifications before/after.
- Shift toggle (on-shift / on-break / off-shift) distinct from "online".

**Route (Onfleet, Route4Me, Circuit)**
- Optimisation aware of time windows, service time, vehicle capacity, driver schedule, traffic — and a driver-visible optimised sequence with re-optimise on the fly.
- Reorder stops manually; skip and come back.

**Universal**
- **Offline-first**: queue completions, proof, and exceptions locally; auto-sync on reconnect. Non-negotiable for basements, warehouses, rural routes.
- Two-way dispatch messaging, document capture (BOL/receipts), in-app job list with all details, customer contact with number masking.
- Earnings / performance summary (gig-economy expectation): stops completed, on-time %, distance, hours.

---

## 5. API changes the redesign will require (phase 2)

Grouped by the feature that needs them. Nothing here invents new domain concepts — it exposes existing internal capability on the public, driver-authenticated surface.

**A. Credentials & onboarding**
1. Move app bootstrap onto the platform token. New group under `fleetbase.platform-api`:
   - `GET  /v1/onboard/organizations?join_code=…` — resolve org by join code / QR payload
   - `GET  /v1/onboard/settings/{companyId}` — replaces the current unauthenticated `driver-onboard-settings`
   - `POST /v1/onboard/invites/{token}/redeem` — invite-based driver creation
   - `POST /v1/onboard/request-to-join` — driver-initiated, dispatcher-approved
2. Keep `drivers/login*` and `verify-code` on the platform guard; everything after login uses the driver's Sanctum token.
3. Retire `linkApp`'s embedded `ApiCredential`; deep link carries host + platform token (or host + one-time enrolment code) only.
4. Per-device sessions: `GET/DELETE /v1/drivers/{id}/sessions` for revoke-on-lost-device.
5. Driver documents: `POST /v1/drivers/{id}/documents` (licence, insurance, right-to-work) + expiry tracking.

**B. Manifests**
6. `GET /v1/drivers/{id}/manifests`, `GET /v1/manifests/{id}` (with stops), `POST /v1/manifests/{id}/start|complete`, `PATCH /v1/manifest-stops/{id}` (arrive / complete / skip / fail + reason), `PATCH /v1/manifests/{id}/resequence`.

**C. Routing**
7. `POST /v1/drivers/{id}/optimize-route` — driver-scoped wrapper over the orchestrator engines, returning an ordered stop list with per-leg distance/duration and ETAs.
8. `PATCH /v1/orders/{id}/waypoints/reorder`.
9. `GET /v1/orders/{id}/route-geometry` — OSRM polyline for in-app route rendering (avoids re-deriving on device).

**D. Vehicle & compliance**
10. Promote to public: `POST /v1/drivers/{id}/assign-vehicle` / `unassign-vehicle`; `GET /v1/vehicles?available=1&fleet=…`.
11. `POST /v1/vehicles/{id}/odometer`.
12. Inspections/DVIR: `GET /v1/inspection-templates`, `POST /v1/inspections`, `GET /v1/vehicles/{id}/inspections`; defect → auto `work-order` / `issue`.
13. Promote to public: `GET /v1/drivers/{id}/hos-status`, `active-shift`, `schedule-items`; add `POST /v1/drivers/{id}/shift/start|end|break`.

**E. Stop execution**
14. `POST /v1/orders/{id}/exception` with configurable reason codes; `GET /v1/order-configs/{id}` already carries the activity flow — extend it with per-activity *required proof* declarations.
15. Barcode: extend `capture-qr` into a general `POST /v1/orders/{id}/capture-scan` accepting multiple codes with `expected` verification against `tracking-numbers`/entities.
16. Geofence-driven auto-arrival events surfaced to the app (`geofences/events` exists) → push + local status transition.

**F. Editing**
17. Expose `entity-editing-settings` publicly (or fold into `orders/{id}/editable-entity-fields`, which already exists) and honour it on `PUT /v1/entities/{id}`.
18. `PATCH /v1/orders/{id}` for driver-permitted fields (notes, custom fields) with a server-side allowlist.

**G. Reliability**
19. `Idempotency-Key` header honoured on every mutating driver endpoint.
20. `POST /v1/sync/batch` — ordered replay of a queued offline mutation log.
21. `GET /v1/notifications` inbox + read receipts.

**H. SDK (`fleetbase-js`)**
22. Dual-credential model: `new Fleetbase({ platformToken, userToken, host })`; stop overloading `publicKey`.
23. New stores: `issues`, `fuelReports`, `manifests`, `manifestStops`, `workOrders`, `inspections`, `files`, `comments`, `chatChannels`, `orderConfigs`, `notifications`.
24. Request interceptors for idempotency keys, offline queueing, and 401 → refresh/logout.

---

## Sources

- [Onfleet Driver App](https://onfleet.com/driver-app) · [Onfleet Proof of Delivery](https://onfleet.com/proof-of-delivery) · [Onfleet add-ons (barcode scanning)](https://support.onfleet.com/hc/en-us/articles/360023669312-Add-ons)
- [Samsara Driver App](https://www.samsara.com/products/workforce-management/samsara-apps) · [Samsara DVIR](https://www.samsara.com/products/apps-and-workflows/dvir) · [DVIR 2.0 offline mode](https://kb.samsara.com/hc/en-us/articles/43217017570829-View-or-Complete-a-DVIR-in-DVIR-2-0)
- [Motive Driver App overview](https://helpcenter.gomotive.com/hc/en-us/articles/31054123805853-Driver-App-Overview) · [Motive HOS clocks](https://helpcenter.gomotive.com/hc/en-us/articles/30870383750557-HOS-Clocks) · [Motive inspections](https://helpcenter.gomotive.com/hc/en-us/articles/31217111225885-Conducting-Inspections)
- [Bringg Driver App](https://help.bringg.com/docs/about-the-bringg-driver-app-1) · [A day in the life of a Bringg driver](https://help.bringg.com/docs/get-started-with-the-bringg-driver-app-1)
- [NextBillion.ai — delivery route app features](https://nextbillion.ai/blog/best-delivery-route-app-features) · [Cigo — offline mode delivery apps](https://cigotracker.com/glossary/the-ultimate-guide-to-offline-mode-delivery-apps-transforming-logistics-efficiency/)
