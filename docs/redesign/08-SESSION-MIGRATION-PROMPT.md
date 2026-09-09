# Navigator v3 — session migration prompt

> **Paste this whole file as the opening message of the new session.** It is written to be read
> by an agent with no memory of the previous work. Everything factual in it was verified against
> the working tree, the FleetOps server source and the GitHub API on **2026-09-09** — not recalled
> from a plan. Where something is unverified, it says so.

---

## 0. Your mission

You are continuing a **complete UI/UX redesign, expansion and refactor of Fleetbase Navigator**, the
React Native driver app. The owner's framing, verbatim:

> "The goal here is not simply a redesign of the app but an expansion and refactor which should
> follow best practices and output an app that follows industry standards for procedures but also
> allows fleetbase navigator to compete against enterprises."

> "This phase is to implement the full complete redesign and make the app as functionally complete as
> possible in this pass, afterwards I will load the app on my phone and do in-run tests alongside my
> partner and we will iterate on each screen and flow individually."

The work is built in a **parallel `src/v3/` tree** behind a cutover flag, so `main` stays shippable.

Two new items are now in scope, both described in detail below:

1. **Trailers** — FleetOps v0.6.65 made trailers a first-class resource. The app needs trailer
   awareness, trailer management, and trailer position ordering.
2. **Inspections / DVIR** — you are **taking over** the FleetOps inspections feature
   ([fleetops#267](https://github.com/fleetbase/fleetops/pull/267)) and coordinating it with the app.
   This is the last major outstanding feature.

---

## 1. Where everything is

| Thing | Path / URL |
|---|---|
| App worktree (work here) | `/Users/ron/Development/fleetbase/navigator-app/.claude/worktrees/navigator-redesign-analysis-1fae32` |
| App branch | `feature/navigator-redesign-analysis-1fae32` (69 commits ahead of `main`) |
| App main checkout | `/Users/ron/Development/fleetbase/navigator-app` |
| FleetOps (linked to the running dev instance) | `~/Development/fleetbase/oss/fleetbase-dev/packages/fleetops` |
| Fleetbase monorepo (CI, seeding scripts) | `~/Development/fleetbase/oss/fleetbase-dev` |
| Postman collection repo | `~/Development/fleetbase/postman` |
| JS SDK | `~/Development/fleetbase/fleetbase-js` |
| Local API | `http://localhost:8000` (Docker, `fleetbase-dev-*` containers) |
| Official docs — **check as you go** | <https://fleetbase.io/docs> |

**This is a git worktree.** The stash stack is shared with the main checkout and other sessions.
Never use bare `git stash` / `git stash pop`. Prefer a temporary WIP commit.

Commands: `yarn test` (jest), `yarn lint`, `yarn typecheck`, `yarn ios`, `yarn android`.
Stack: React Native 0.86, React 19.2.7, Tamagui 1.125.20, React Navigation 7, MMKV, Hermes.

---

## 2. Working agreement — these were learned the hard way

**Read the server, not the plan.** The implementation ledger's blocker table was written from the
phase plan rather than from `routes.php`, and **8 of its 19 entries were wrong** — three named
endpoints that were never going to exist because the capability already shipped under another name.
Before you accept that anything is blocked, grep `server/src/routes.php` on the released tag.

**Check the official docs.** <https://fleetbase.io/docs> is the KB. A previous session declared that
order-configs published no activity sequence, based on one API response, without reading the docs.
The flow is a directed graph with `sequence`, `activities` and `logic`; the *public resource* was
stripping them. That cost a wasted slice and a PR to fix.

**FleetOps changes go on the current release branch, as PRs for review — never merged by you.**
At the time of writing the released tag is **v0.6.65**. Confirm the current release branch before
opening anything.

**Never report a command's status from a pipe's exit code.** `yarn typecheck` has ~15 pre-existing v2
errors and has never passed project-wide. Judge a change by diffing against a clean-tree baseline,
not by the exit code. A previous session repeatedly told the owner "typecheck clean" while reading
the exit status of a `grep` at the end of a pipe.

**Scripted edits write to a temp file and `os.replace`.** A `sed`-style rewrite once truncated
`App.tsx` to 0 bytes, and a self-recursive regex once rewrote an accessor's own body into infinite
recursion and exhausted memory.

**Do not run `php artisan optimize:clear` or `octane:reload` against the owner's dev instance.**
A previous session did, and took the API down — every Octane worker timed out at 600s during boot,
and recovery needed a container restart plus rebuilding the config, event, route and view caches.
If you need the instance to pick up new code, ask first and say what you intend to run.

**Secrets.** `.env*` is gitignored and holds `FLEETBASE_KEY`, `FLEETBASE_PLATFORM_TOKEN`,
`GOOGLE_MAPS_API_KEY`, `STRIPE_KEY`, `FACEBOOK_CLIENT_TOKEN`, `TRANSISTORSOFT_LICENSE_KEY`. Mask
them whenever printed. Driver credentials for the dev instance must never be committed. Do not fire
`login-with-sms` casually — it sends a real SMS/email.

**Instrumentation beats substitution.** One defect cost twelve wrong guesses because components were
swapped out one at a time; measuring whether the touch event arrived settled it in three runs.
**Fixtures agree with whoever wrote them** — seven defects were invisible under test fixtures and
surfaced within minutes of pointing the app at a real instance.

---

## 3. Current state of the app — verified 2026-09-09

| Metric | Value |
|---|---|
| v3 screens | 32 built, 6 still `placeholder()` |
| v3 source | 173 files, ~25,300 lines |
| Tests | 786 passing, 55 suites, 0 failing |
| v3 lint / typecheck | **0 errors** (93 warnings) |
| v2 lint / typecheck | 596 lint errors, 15 type errors — **pre-existing, untouched** |
| Cutover | `NAVIGATOR_V3=true` in `.env` selects the v3 tree at `App.tsx` |

### Done — foundation and Tier 1

Waypoint theme (4 schemes + white-label override), status registry (45 statuses), component library,
app shell (header, duty control, offline strip), 5-tab navigation, **durable MMKV mutation queue**,
`NavigatorAdapter` (dual credentials, idempotency keys, 20s timeout, never-queue list), normalised
order store with selectors, realtime/SocketCluster layer, i18n layer.

Screens: Today, Orders list + detail (config-driven stepper), proof capture (photo/QR/signature),
edit payload item, item detail, order timeline, edit destination, fuel log (list/detail/create),
issues (list/detail/create), Inbox (conversations, composer, participants), Account, org switcher,
profile edit, my vehicle, change vehicle, sign in (password + one-time code), navigation hand-off,
permissions primer, self-hosted connection, sync queue, error states, ad-hoc offers, settings, help.

### The six placeholders

`src/v3/navigation/DriverTabs.tsx` — all reachable, all showing a "not built" state:

| Placeholder | Stack | Status |
|---|---|---|
| `RouteHome` | Route | **Buildable now** — manifest endpoints shipped in v0.6.61 |
| `StopDetail` | Route | **Buildable now** |
| `StopExecution` | Route | **Buildable now** (order proof capture is separate and *is* built) |
| `OptimisePreview` | Route | **Buildable now** |
| `Inspection` | Account | Your new scope — see §6 |
| `Documents` | Account | Still blocked, no endpoint |

**The entire Route tab is a placeholder.** It is one of five tabs, it is the biggest remaining gap,
and everything it needs has been live since v0.6.61. Treat it as the first priority.

---

## 4. What the API releases since v0.6.61 changed

Read the full notes: <https://github.com/fleetbase/fleetops/releases>

**v0.6.61** — driver password endpoints, driver manifests. Unblocks:

```
GET   /v1/drivers/{id}/manifests        list a driver's manifests
GET   /v1/manifests/{id}                manifest with stops in driving order, place inline, totals
POST  /v1/manifests/{id}/optimize       nearest-first re-sequence of stops still to do
PATCH /v1/manifest-stops/{id}           arrive / complete / skip, runs the model's own transitions
POST  /v1/drivers/{id}/change-password  proves the current password; re-issues the caller's token
POST  /v1/drivers/forgot-password       identical answer for unknown identity (no enumeration)
POST  /v1/drivers/reset-password        code must be issued `for: driver_password_reset`
```

Note the optimise route is **per-manifest**, not the `drivers/{id}/optimize-route` the old ledger
named — that endpoint was never built. There is still **no resequence endpoint**, so B4
(manual drag-to-reorder) has nothing to write to.

**v0.6.62** — the public Vehicle contract went from 21 accepted fields to 90 (identity, odometer,
body, capacity and dimensions, lifecycle, regulatory, engine specs, structured `specs`/`details`/
`meta`). My Vehicle can show far more than it does. Fleet membership endpoints were added. Drivers
can now exist without email or phone — such a driver **cannot sign in to Navigator**, which the app
should probably say rather than fail opaquely.

**v0.6.64** — fixes a bug Navigator was hitting directly: `GET /v1/orders?with=payload` failed
during serialisation with `RelationNotFoundException` on `Vehicle` whenever an order had a vehicle
assigned. If the app carries any workaround for that, remove it.

**v0.6.65 — first-class trailers.** See the next section.

---

## 5. Trailers — new scope

FleetOps v0.6.65 made trailers a first-class resource with a full public API. **The app has no
trailer concept at all today** (`grep -ri trailer src/` returns nothing).

### Public API surface, verified in `routes.php` at v0.6.65

```
GET    /v1/vehicles/{id}/trailers    trailers currently attached to a vehicle
GET    /v1/trailers                  query
POST   /v1/trailers                  create
GET    /v1/trailers/{id}             find
PUT    /v1/trailers/{id}             update
DELETE /v1/trailers/{id}             delete
PUT|PATCH|POST /v1/trailers/{id}/track   position/telemetry
POST   /v1/trailers/{id}/attach      { vehicle, connected_at?, source?, position? }
POST   /v1/trailers/{id}/detach      { disconnected_at?, notes? }
GET    /v1/trailers/{id}/connections connection history
```

**`position` on attach is the trailer-position ordering the owner asked for** — an integer ≥ 1, so a
road train / B-double is expressible as ordered connections behind one vehicle. Attach is idempotent
when the trailer is already on the same vehicle, and **refuses** a move while attached to another
vehicle: detach first. Both operations run in a transaction with `lockForUpdate`.

### Trailer resource fields worth surfacing to a driver

`asset_class: 'trailer'`, `name`/`display_name`/`code`, `type`, `body_type`, `status`,
**`attachment_state`**, `connectivity_status`, `online`, `vin`, `plate_number`, `serial_number`,
make/model/year/colour, `photo_url`; towing connection (`vehicle_id`, `current_vehicle_name`,
`attached_at`, `current_connection`); dimensions and capacity (`length`, `width`, `height`,
`tare_weight`, `gvwr`, `payload_capacity`, `cargo_volume`); running gear (`axle_count`, `tire_count`,
`door_count`, `coupling_type`, `brake_type`, `abs_equipped`, `ebs_equipped`); **refrigeration**
(`refrigerated`, `temperature_min`, `temperature_max`, `reefer_engine_hours`); `odometer`,
`odometer_unit`, `engine_hours`; `location`, `speed`, `heading`, `altitude`, `last_online_at`,
`telematics`, `positions`; `equipment` and `devices` (public reads `equipment`, the console reads
`equipments` — do not confuse them).

### What to design and build

There are **no design frames for trailers** — round 2 predates the feature. You will need to specify
these against the Waypoint system before building (see §7):

- **My vehicle** gains an attached-trailers section: each trailer with its position in the train,
  identifier, attachment state, and reefer temperature if refrigerated.
- **Attach / detach a trailer** — pick from available trailers, set position, confirm. The "already
  attached elsewhere" refusal is a real state and needs a designed treatment, not a raw error.
- **Trailer detail** — the read view: identity, dimensions/capacity, running gear, reefer, telematics.
- **Trailer position ordering** — reorder the train. Note attach takes a `position`, so ordering is
  expressible today; confirm whether re-positioning an already-attached trailer needs detach+attach
  or whether an update path exists, and open a FleetOps PR if it does not.
- **Coupling checks belong in the DVIR** — the inspection spec already names "coupling" as a
  checklist area. Coordinate the two.

Open questions to settle with the owner: does a driver *manage* trailers or only view them? Should
attach/detach be queueable offline like other mutations? Is trailer odometer/reefer-hours capture a
driver responsibility?

---

## 6. Inspections / DVIR — you are taking this over

**PR:** <https://github.com/fleetbase/fleetops/pull/267> — "Add inspection maintenance platform foundation"
**Branch:** `feature/maintenance-platform-upgrade` → `main`
**State (2026-09-09):** OPEN, not a draft, 104 files, +3250/−5, last updated **2026-07-17**.
`mergeable: MERGEABLE`, `mergeStateStatus: BLOCKED`.
**Dependency:** [fleetops-data#68](https://github.com/fleetbase/fleetops-data/pull/68) — **already merged**.

### The first problem: it is 976 commits behind `main`

Three commits ahead, **976 behind**. Everything since v0.6.60 — including all of the manifests,
password, vehicle-contract and trailer work — landed after it. Rebasing 104 files across that gap is
the first task and it is not small. Do it before evaluating anything else, because the current diff
does not reflect what the code would actually do on today's `main`.

### The second problem: there is no driver-facing API

This is the critical finding. Verified against `routes.php` on the branch, the **only** inspection
routes are:

```php
$router->prefix('public')->namespace('Public')->group(function ($router) {
    $router->get('inspections/forms/{id}',        'PublicInspectionController@show');
    $router->post('inspections/forms/{id}/submit', 'PublicInspectionController@submit');
});
```

That `public` prefix is the **unauthenticated tokenised-link** namespace — someone opens a shared URL
with `?token=…` and fills in a form. It is not the `v1` consumable API and carries no driver auth.
Everything else is `internal/v1` console CRUD (`inspection-forms`, `inspection-submissions`).

**Navigator cannot use any of it.** Building E3/E4 means adding the driver-authenticated `v1`
surface yourself, on that branch, as part of taking the feature over. At minimum:

```
GET  /v1/inspection-forms?subject=vehicle&type=dvir   forms this driver must complete
GET  /v1/inspection-forms/{id}                        the form with its items
POST /v1/inspections                                  submit (driver-authenticated)
GET  /v1/vehicles/{id}/inspections                    history for a vehicle
GET  /v1/inspections/{id}                             one submission with item results
```

Model the submit body on the existing public one so the two stay consistent, and set
`source` to something other than `public_link`.

### The data model, as it stands on the branch

**`InspectionForm`** — `name`, `description`, `type` (e.g. `dvir`), `status`, `frequency`,
polymorphic `subject_type`/`subject_uuid`, **`items` (JSON)**, **`settings` (JSON)**, `meta`,
`published_at`. Appends `subject_name`, `item_count`, `is_published`. A form is usable only when
`status === 'published'` **and** `published_at` is set.

**`InspectionSubmission`** — links form, vehicle, driver, `submitted_by`, and optionally an `issue`
and a `work_order`. Carries `type`, `status`, `result`, `source`, `odometer`, `engine_hours`,
`total_items`, `failed_items`, `started_at`, `submitted_at`, `resolved_at`, `location`, `signature`,
`attachments`, `meta`. Has `syncResultCounts()`, `has_failures`, `createIssueFromFailures()`,
`createWorkOrderFromFailures()`.

**`InspectionItemResult`** — one row per checklist item: `item_key`, `label`, `category`, `status`,
`severity`, `passed` (bool), `comments`, `photos` (JSON), plus optional `issue_uuid`/`work_order_uuid`.

**`InspectionLink`** — the tokenised public link: `token_hash`, `single_use`, `expires_at`,
`last_viewed_at`, `used_at`, `used_ip`. Not needed for the driver path.

**Submission contract** (from `PublicInspectionController@submit`, mirror it):

```jsonc
{
  "odometer": 0,            // nullable int
  "engine_hours": 0,        // nullable int
  "item_results": [         // required, min 1
    {
      "item_key": "…",      // nullable
      "label": "…",         // REQUIRED
      "category": "…",      // nullable
      "status": "…",        // nullable; defaults to passed ? 'passed' : 'failed'
      "severity": "…",      // nullable
      "passed": true,       // REQUIRED bool
      "comments": "…",      // nullable, max 2000
      "photos": []          // nullable array
    }
  ],
  "location": {},           // nullable
  "signature": {},          // nullable
  "attachments": []         // nullable
}
```

**Failure handling is server-side and config-driven.** If `form.settings.create_issue_on_failure` is
set and the submission has failures, an Issue is created; likewise
`create_work_order_on_failure` → WorkOrder. The app should surface *that this happened*, not
re-implement it.

### App-side requirements

- The design spec calls E3 **"the largest missing flow"** and requires it to be
  **fully completable offline with a visible queued state on every step**. Photos and signature must
  go through the existing MMKV mutation queue — proof capture already proves this works, because the
  capture endpoints accept base64 rather than only multipart, which is what makes a capture queueable
  across a cold start.
- Grouped checklist by area (exterior, interior, brakes, lights, tyres, **coupling**, safety
  equipment) with progress; per-item defect capture (severity + photo + note); review-before-submit;
  odometer + certification signature; the submitted receipt; and the **"defect found — vehicle marked
  unsafe"** outcome.
- **E4 Inspection history** — past DVIRs with status and defect counts.
- **E5 Vehicle defects** feeds the same pipeline; **E6 maintenance/work orders** is the read side.
  Note **work orders already have a public API** (`/v1/work-orders` CRUD + `{id}/send`), so the
  work-order half of E6 is buildable today; completed `maintenances` remain console-only.

### Also required whenever you add endpoints

Every new consumable endpoint must be added to the **Postman collection**
(`~/Development/fleetbase/postman`) as a PR, and the FleetOps **Postman API contract CI must still
pass**. Hard-won rules from doing this before:

- The contract asserts **every request returns 2xx**. A request that cannot succeed unattended reads
  as a broken endpoint.
- **`pm.execution.skipRequest()` is not a skip** — the Postman CLI reports it as
  "Request could not be completed", a run error that fails the contract. Do not use it.
- CI runs `scripts/ci/order-collection-requests.py`, which **defers every DELETE to the tail of the
  run**. A plain local run is therefore *not* a faithful simulation; generate the ordering and pass
  the `-i` args if you need to reproduce CI.
- Variables like `driver_identity` / `driver_password` / `driver_phone` are injected by CI for a
  seeded driver. Do not overwrite them from a request script — doing so broke three driver-auth
  requests once.
- Codes are matched on **purpose as well as value**; a new code-checking endpoint needs its own
  seeded `VerificationCode` row in `scripts/ci/mint-api-key.php` in the fleetbase monorepo.

The FleetOps `server` CI enforces **100% line coverage** (`--fail-under=100`, currently ~34.7k
statements). Every line you add needs a test that executes it. The test harness has no Laravel app
and no hashing implementation — bind a hasher behind `Illuminate\Contracts\Hashing\Hasher` if you
touch a password path, and use guarded `class_exists`/`trait_exists` + `eval()` stubs for absent
framework pieces, as the existing tests do.

---

## 7. The design spec — analyse it before implementing

**Source of truth, in order:**

1. `docs/redesign/02-CLAUDE-DESIGN-PROMPT.md` — the round 1 brief.
2. `docs/redesign/03-DESIGN-GAP-SPEC.md` — the round 2 brief. **Read this in full.** It carries the
   invariants, six corrections to round 1, and a screen-by-screen spec for ~48 screens keyed
   `A1…I5`.
3. `src/v3/theme/` and `src/v3/ui/` — the system **as actually built**. Where a doc and the code
   disagree, the code is what ships; reconcile deliberately rather than silently.
4. Round 1 Claude Design project `4dddbb4b-bdbf-4e12-ae68-2970c0c5050d` — the 19 high-fidelity
   frames plus the interactive prototype.

**Important: design round 2 was never delivered.** It was truncated at the read cap partway into
section H. So sections A–I of the gap spec are *written* specs with **no frames**, including
**E3 (DVIR), E4 and E5** — exactly what you are now taking over — and there are no trailer designs at
all. You will be implementing from prose against a built design system. Either commission a design
round for E3/E4/E5 + trailers, or write the frames' worth of specification yourself and get it
approved before building. Do not improvise a parallel visual treatment.

**The eight invariants — every screen is checked against these:**

1. Identifiers render **in full, monospaced, on their own line, never truncated**. A driver matches
   these against a physical label. (A real defect: `Identifier` unboxed uses `flex: 1`, which
   collapses inside a `space-between` row and rendered an empty plate. Assert the **value**, not that
   the row exists.)
2. **Never colour-only.** Every status pairs hue with **shape and glyph**.
3. **One unmistakable next action per screen**, bottom third, minimum 48dp.
4. **Offline is a state, not an error** — calm neutral, queued count visible, work never lost.
5. **Tabular numerals** for distance, time, money, odometer, counts.
6. **Dark is the default.** Every screen needs dark and light; `sunlight` and `night` inherit.
7. Design for **~30% text expansion and RTL**. Author every string through `t()` from the start —
   retrofitting is far more expensive.
8. **Config-driven surfaces degrade honestly** — show a "not enabled" state, never fake data.

**Verification gate already in force:** every v3 screen renders in **all four schemes** under test.
Keep that gate. `src/v3/ui/__tests__/no-hardcoded-copy.test.js` parses the sources to keep English
literals out of the component library — keep that too.

---

## 8. What is still genuinely blocked

Re-verified against `routes.php` at v0.6.65. Do not start these without backend work:

| Capability | Why |
|---|---|
| Duty: break / shift / HOS card | `hos-status`, `active-shift` exist but only on the console namespace |
| Failed delivery / exception (C1) | No exception endpoint, no reason codes |
| Manual resequencing (B4) | Only the automatic optimise shipped |
| Notification inbox (G4) | No driver-facing notification route |
| My documents (A6) | No driver document endpoints |
| Devices and sessions (A5) | No session list/revoke routes |
| Maintenance history | `maintenances` is console-only (work orders **are** public) |
| Earnings (H2) | No earnings, payout or rate data exists in FleetOps at all |

Also outstanding, app-side: **chat attachments** need `POST /v1/files` plus a picker (composer is
text-only today), and a chat channel carries **no order reference**, so G1's order-context header has
nothing to link to.

**Tier 2 — the SDK.** `fleetbase-js` still has no stores for `issues`, `fuelReports`, `manifests`,
`workOrders`, `inspections`, `trailers`, `files`, `comments`, `chatChannels`, `orderConfigs`,
`notifications`. v3 reaches these through the adapter directly. Adding the stores is legitimate
work and should ship alongside whatever endpoints you consume.

---

## 9. Before the owner runs it on a device

The owner intends to load the app on a handset and test with a partner, iterating screen by screen.
These block a *useful* session:

1. **Build the Route tab.** Otherwise a whole tab is a placeholder and the flow most worth testing on
   the road — stops, arrive, optimise — is the one that cannot be tested. Everything it needs is live.
2. **`react-native-config` bakes `.env` into the native binary**, not the JS bundle. Pointing the app
   at production is a **rebuild**, not a Metro reload. A reload will look like the change did nothing.
3. **Drop the unused Contacts permission.** `NSContactsUsageDescription` is declared and `Contacts`
   is in the Podfile's `setup_permissions`, but the app has no contacts feature. App Store rejection
   risk and a needless privacy prompt. Needs `pod install`, so fold it into the same rebuild.
4. **Decide what the two Account placeholders should do** — Inspections (until §6 lands) and My
   documents. Either an explicit "not enabled" state or remove them from the list, so the session
   isn't spent rediscovering them.

Toolchain note: CocoaPods is fixed at 1.17.0 with `.ruby-version` added. `cocoapods >= 1.13` and
`xcodeproj < 1.26.0` are mutually unsatisfiable, which is why `bundle install` could not produce a
working CocoaPods and the toolchain had to be installed outside bundler.

---

## 10. The documents you inherit

| File | What it is |
|---|---|
| `docs/redesign/01-AUDIT.md` | Audit of the existing app that motivated the rebuild |
| `docs/redesign/02-CLAUDE-DESIGN-PROMPT.md` | Round 1 design brief |
| `docs/redesign/03-DESIGN-GAP-SPEC.md` | Round 2 brief — invariants, corrections, ~48 screen specs |
| `docs/redesign/04-LOOP-PROMPT.md` | The per-iteration working loop the previous sessions ran |
| `docs/redesign/05-IMPLEMENTATION-LEDGER.md` | Slice-by-slice state **plus long-form notes on what each slice cost**. The Tier 3 blocker table is partly stale — §8 above supersedes it |
| `docs/redesign/06-DEFECT-REGISTER.md` | Every defect found, with how it was found. Read the tail sections — they are method, not trivia |
| `docs/redesign/07-BLOCKER-AUDIT.md` | The audit that found the ledger's blocker table wrong |
| `docs/redesign/08-SESSION-MIGRATION-PROMPT.md` | This file |

A readiness snapshot as of 2026-09-02 is published at
<https://claude.ai/code/artifact/900f3e70-b943-4fbb-9a0b-32dfba8150b6>.

---

## 11. Traps that have already cost real time

- **The app once believed it was always online.** `isConnected` defaulted to `true` because
  `App.tsx` never passed it, so every offline affordance was unreachable. Reachability is judged from
  **whether our own requests reach the API** — deliberately not netinfo, because a handset shows full
  signal through a captive portal, a dropped VPN or a dead server.
- **The authoritative current destination is `payload.current_waypoint`**, resolved against the
  order's own stop list — not the tracker's `active_stop`. Three order shapes must work:
  pickup+dropoff, pickup+waypoints+dropoff, and waypoints-only. See `src/v3/data/orderStops.ts`.
- **Order flow is a directed graph**, not a list: `activities` (child codes), `sequence` (sibling
  order), `logic` (and/or/not gates), `complete` (terminal). `logic` is deliberately **not** evaluated
  client-side; it defers to dispatch. See `src/v3/data/activityFlow.ts`.
- **The ad-hoc offer socket event is `order.ping`** (`OrderPing::broadcastType()`). A previous
  session invented `OrderOffered`, which does not exist.
- **Never queue a claim on a shared job.** `orders/{id}/start` is in `NEVER_QUEUE`; an offline accept
  would replay hours later and claim a job that is long gone.
- **Tamagui `elevation` is a shorthand that overrides explicit shadow props** — that is how heavy
  shadows crept back in after being removed.
- **A socket says *something changed*; the app then refetches.** Socket state is not reachability,
  and a throwing handler must not kill the iterator.

---

## 12. Decisions the owner still owes you

Raise these early rather than guessing:

1. **Trailers** — view-only or full driver management? Should attach/detach be offline-queueable?
   Is trailer odometer / reefer-hours capture a driver responsibility?
2. **Inspections** — do you commission a design round for E3/E4/E5 (and trailers), or build from the
   written spec with your own frames approved first?
3. **Inspections rebase** — 976 commits is a large rebase. Confirm the owner wants it rebased onto
   the current release branch rather than re-cut fresh from today's `main`.
4. **Scope of the driver inspection API** — the proposed routes in §6 are a proposal, not a
   specification. Get them agreed before implementing, since they set the contract.
5. **Turn-by-turn** (correction 4 in the gap spec) — Driving glance is currently scoped to next-stop
   + hand-off. Confirm that stays for v3.0.
6. **Phone masking** (correction 3) — specified as the right behaviour but has no backing capability
   anywhere in FleetOps. Build it as a FleetOps feature, or drop it from the design?
