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

Four things are in scope beyond finishing the tree, each described in detail below:

1. **Trailers** — FleetOps v0.6.65 made trailers a first-class resource. The app needs trailer
   awareness, trailer management, and trailer position ordering. (§5)
2. **Inspections / DVIR** — you are **taking over** the FleetOps inspections feature
   ([fleetops#267](https://github.com/fleetbase/fleetops/pull/267)) and coordinating it with the app.
   This is the last major outstanding feature. (§6)
3. **Full internationalisation from the start** — every screen, every string, translation files
   included. Not a later pass. (§7a)
4. **Driver wallet earnings via the ledger API**, opening a PR against the ledger extension if
   changes are required. (§8a)

Three standing rules from the owner, carried across every session:

- FleetOps and ledger changes go on the current release branch as **PRs for review** — never merged
  by you.
- **Cross-check <https://fleetbase.io/docs>** and the core-api / FleetOps source as you go.
- New consumable endpoints must be added to the **Postman collection** as a PR, and the FleetOps
  Postman contract CI must still pass.

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

### The prototypes — read them before implementing any screen

**Access is already authorized on this machine** (`/design-login` has been run). Read them with the
**`DesignSync`** tool:

```
DesignSync method=list_files projectId=4dddbb4b-bdbf-4e12-ae68-2970c0c5050d
DesignSync method=get_file  projectId=4dddbb4b-bdbf-4e12-ae68-2970c0c5050d path="<one of the files below>"
```

`list_projects` returns **empty** — it filters to design-*system* projects and this one is
`PROJECT_TYPE_PROJECT`. Address it by id directly; `get_project` confirms `canEdit: true`. These are
not artifact URLs: `WebFetch` and the `Artifact` tool cannot read them. Files run 150–265 KB, so a
`get_file` spills to disk — parse the saved JSON rather than reading it all into context.

**There are seven design files, not two.** A previous handover named only the two the owner linked:

| File | What it is |
|---|---|
| `Navigator Design System.dc.html` | **The Waypoint system itself** — exact tokens for all 4 themes, 11 statuses, type scale, space, radius, elevation, motion, buttons. Start here. |
| `Navigator Redesign.dc.html` | Round 1 — 19 frames, `s01`–`s19` |
| `Navigator Redesign R2.dc.html` | Round 2 — 40 frames, `A1`–`H2` |
| `Navigator Prototype.dc.html` | The round 1 interactive prototype (app shell, duty sheet, Account home) |
| `Navigator Prototype v2.dc.html` | A later prototype revision — **not previously mentioned anywhere**; diff it against v1 before trusting either |
| `Navigator Redesign-print.dc.html`, `Navigator Prototype v2-print.dc.html` | Print/export variants of the above |
| `uploads/` | The audit and round 1 brief, plus 8 screenshots of the **old** app for reference |

Round 1 (`s01`–`s19`): Today; Route map; Route list; Driving glance (always dark); Orders; Order
detail; Edit payload item; Stop execution; Fuel log; Report an issue; Inbox; Today dark; Welcome;
Find your organization; Verification code; Onboarding checklist; Route map dark; Orders dark; Stop
execution dark.

**Source of truth, in order:**

1. The two canvases above — the actual frames.
2. `docs/redesign/03-DESIGN-GAP-SPEC.md` — the round 2 brief. **Read this in full.** It carries the
   invariants, six corrections to round 1, and a screen-by-screen spec for ~48 screens keyed
   `A1…I5`. It is the brief the R2 canvas was drawn from, so use it as the index into the frames.
3. `docs/redesign/02-CLAUDE-DESIGN-PROMPT.md` — the round 1 brief.
4. `src/v3/theme/` and `src/v3/ui/` — the system **as actually built**. Where a doc and the code
   disagree, the code is what ships; reconcile deliberately rather than silently.

**What R2 covers — read from the file, not inferred.** R2 contains **40 frames**, and each is drawn
in a specific state rather than as a neutral default, which is most of their value:

`A1` sign in, 4 auth methods · `A2` permissions primer, **location denied with recovery** · `A3` org
switcher, **switching / session teardown** · `A4` self-hosted, **unreachable** · `A5` devices &
sessions, **revoking** · `A6` my documents, mixed states · `A7` profile, **editing with conflict** ·
`B1` manifests, multi-day · `B2` stop detail · `B3` optimise preview, **before/after** · `B4` manual
resequencing, **dragging, delta worse** · `C1` failed delivery · `C2` ID/age verification, **fail
path** · `C3` custom fields renderer, **validation error** · `C4` complete stop, **blocked on missing
proof** · `C5` proof of delivery record · `C6` arrive out of geofence · `D1` ad-hoc offer, **stacked,
counting down** · `D2` edit destination, pin adjust · `D3` destination changed by dispatch · `D4`
item detail, **damaged flagged** · `D5` order timeline, live · `D6` navigation hand-off · `E1` my
vehicle, **1 open defect** · `E2` change vehicle, **inspection-required gate** · **`E3a` pre-trip
checklist offline · `E3b` inspection item defect capture · `E3c` review & certification · `E3d`
submitted — vehicle marked unsafe** · `E4` inspection history · `E5` vehicle defect with status
timeline · `E6` maintenance & work orders, due soon · `F1` documents, **upload failed** · `F2` fuel
report, **rejected with reason** · `F3` issue detail, escalated · `G1` conversation, **order context,
failed send** · `G3` new conversation · `G4` notification detail · `H1` settings, **tracking disabled
warning**.

**The whole DVIR flow is drawn** — `E3a`–`E3d`, plus `E4`, `E5`, and the `E2` inspection-required
gate. That is the feature you are taking over, so read those five frames before designing anything.
Note `E3a` is drawn **offline**, which matches the requirement that inspections complete without a
connection.

**Where R2 actually stops:** the document ends mid-label at `H2 · Earnings —`. It was truncated
during **generation**, not merely during a previous session's reading. So `H2` has a heading and no
frame, and **`G2`** (composer), **`H3`** (help), **`H4`** (sign out) and **all of section I** —
sync queue, error states, push notifications, Live Activity / foreground notification, tablet
layouts — were never drawn. I1 and I2 were built from the design system directly, which is legitimate
because they are mechanical; the rest need a design round or an explicit decision to ship without
them.

**Trailers have no frames at all** — the feature postdates both rounds. Either commission a round for
them, or specify the frames' worth yourself and get it approved before building. Do not improvise a
parallel visual treatment.

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

### The system's exact values, and the fidelity check

From `Navigator Design System.dc.html`. Use these when adding anything new, so trailers and
inspections land inside the system rather than beside it.

| Token | Dark (default) | Light | Sunlight | Night |
|---|---|---|---|---|
| background | `#0B1017` | `#F4F6F9` | `#FFFFFF` | `#0C0906` |
| surface | `#121927` | `#FFFFFF` | `#FFFFFF` | `#151009` |
| surfaceRaised | `#1A2333` | `#FFFFFF` | `#F2F4F7` | `#1E1710` |
| border | `#243044` | `#E2E8F0` | `#101828` | `#2C2114` |
| textPrimary | `#F2F5F9` | `#101828` | `#000000` | `#E8D9C5` |
| textSecondary | `#A8B3C4` | `#46536A` | `#1D2939` | `#B39C7D` |
| textMuted | `#64748B` | `#8494AB` | `#475467` | `#6E5D45` |
| primary | `#3D7BFA` | `#2E63D9` | `#0040DD` | `#D98A3D` |
| onPrimary | `#FFFFFF` | `#FFFFFF` | `#FFFFFF` | `#160D02` |

**Statuses — hue + shape + glyph, never colour alone:** `created` #8394AB ·circle ·
`preparing` #4C9AFF ·circle · `dispatched` #4C9AFF »square · `driver_assigned` #8B7CF6 A·square ·
`driver_enroute` #F5A623 »diamond · `started` #3D7BFA ▸square · `arrived` #22B8A8 ◎circle ·
`completed` #2FBF71 ✓circle · `canceled` #8394AB ×square · `failed` #E5484D !diamond ·
`on_hold` #E3C000 ‖square.

**Type** (Archivo): display 34/800/−.02em · title 28/700 · heading 22/700 · body 17/500 ·
secondary 15/500 · caption 13/600 · micro 11/700/.06em. **Glanceable tier**: 56 (ETA), 40
(distance), stop-sequence badge min 44×44dp. Identifiers in JetBrains Mono.

**Space** 4/8/12/16/24/32/48 · **radius** compact 10, hero 18, pill 999 · **detents** peek 120,
half 50%, full 92% · **buttons** 5 variants × 6 states (default, pressed, disabled, loading, error,
skeleton), min 48dp.

**Elevation** base flat · card `0 1px 2px #0009` · sheet `0 -8px 32px #000c` · floating action
`0 8px 20px #3D7BFA40` · map overlay `0 4px 16px #000a` with `blur(12)`.

**Motion, nothing over 250ms:** sheet 220ms spring(.86) · list reorder 180ms ease-out · status
confirm 240ms spring(.8) · sync tick 200ms ease-out · press feedback 90ms linear at scale .97.

**Fidelity check, run 2026-09-09:** every one of the 36 theme hex values above, all 11 status hues,
all glyphs and all three marker shapes are present in `src/v3/theme/`. **The built system matches the
delivered design exactly** — so when a screen looks wrong, suspect the screen's composition, not the
tokens. Re-run that diff after any theme change.

---

## 7a. Internationalisation is a requirement, not a later pass

**The app must be fully internationalised from the start — every screen, every string, translation
files included.** This is an explicit requirement from the owner, and it is also the cheapest thing
to get right early and the most expensive to retrofit: the original app was effectively unlocalised
and only 6 of 34 screens imported the language hook, which is much of why this rebuild exists.

**What is already built:**

- `src/v3/i18n/` — a v3 layer on `i18n-js` with **pluralisation and interpolation**. Deliberately
  not reusing `src/utils/localize.js`, which imports the v2 `tamagui.config` and would pull a second
  Tamagui config into the v3 tree.
- `translations/en.json` — **719 keys**, shared by v2 and v3 so a translator sees one job. v3
  namespaces: `account`, `changeVehicle`, `common`, `connect`, `conversation`, `destination`,
  `editPayloadItem`, `failure`, `fuelCreate`, `fuelLog`, `fuelReport`, `handoff`, `help`, `inbox`,
  `issueCreate`, `issueDetail`, `issues`, `itemDetail`, `nav`, `newConversation`, `offers`,
  `orderDetail`, `orderStatuses`, `orderTimeline`, `ordersScreen`, `orgSwitcher`, `otp`,
  `permissions`, `profile`, `proof`, `settings`, `signIn`, `sync`, `today`, `ui`, `vehicle`.
- Missing keys warn loudly in `__DEV__` and return undefined in production.
- `no-hardcoded-copy.test.js` enforces `t()` across the component library.
- `setLocale()` exists.

**What is missing — treat as open work:**

1. **There is only one catalogue.** `catalogues = { en }`. No second language exists, so nothing has
   ever exercised a real translation path. Add at least one non-English locale early — ideally one
   that stresses the assumptions (a longer language for the ~30% expansion rule, and an RTL one).
2. **No RTL handling anywhere.** `grep -rn "I18nManager" src/` returns nothing. Invariant 7 requires
   RTL, and RTL is not a translation problem — it is a layout problem. Retrofitting it after 32
   screens is materially harder than doing it now, and it interacts with every row, icon direction
   and swipe gesture in the app.
3. **Settings shows language as a read-only row**, not a picker (`SettingsScreen.tsx:167` renders a
   `ListRow` with `meta`), because there is nothing to switch to. H1 specifies a real selector.
4. **No device-locale detection** wired at startup.
5. `settingsStore` defaults `language: 'en-GB'` while the catalogue is keyed `en` — reconcile
   language tags versus catalogue keys before adding locales, or fallbacks will silently misfire.
6. **Every new screen — trailers, inspections, the Route tab — must be authored through `t()` from
   the first commit**, with its keys added to `en.json` in the same change. Do not leave literals to
   sweep up later.
7. Dates and numbers: v2 hard-codes English in `formatWhatsAppTimestamp` and passes no locale to
   `date-fns`. Anything v3 shares with it needs checking.

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

**Earnings is no longer in this table** — it moves to the ledger extension. See §8a.

Also outstanding, app-side: **chat attachments** need `POST /v1/files` plus a picker (composer is
text-only today), and a chat channel carries **no order reference**, so G1's order-context header has
nothing to link to.

---

## 8a. Driver wallet and earnings — build on the ledger extension

**Owner's decision: driver earnings go through the ledger API, not a new FleetOps concept.** Open a
PR against the ledger if changes are required.

Repo: `git@github.com:fleetbase/ledger.git`, checked out at
`~/Development/fleetbase/oss/fleetbase-dev/packages/ledger`.

**What already exists.** A consumable, driver-facing wallet API — verified in the ledger's
`routes.php` and against the running instance. Routes sit behind the `fleetbase.api` middleware under
the `ledger` prefix, so the real paths are:

```
GET  /ledger/v1/wallet               wallet for the authenticated subject (creates on first read)
GET  /ledger/v1/wallet/balance       { balance (minor units), formatted_balance, currency, status }
GET  /ledger/v1/wallet/transactions  filter: type, direction, status, date_from, date_to; limit/page
POST /ledger/v1/wallet/topup
```

I confirmed `/ledger/v1/wallet/balance` is routed and answers `401` to an organisation API key;
`/v1/ledger/...` is **not** a route (404). The controller resolves the subject from `_consumer`
first, then `session('user')` — with a comment documenting that a driver's own Sanctum token is the
intended credential and that `$request->user()` is null under `fleetbase.api`. **I did not verify the
driver-token path end to end; do that first, before designing anything on top of it.**

`Wallet` is polymorphic and its own docblock names the case explicitly:
`driver: Earnings wallet for FleetOps drivers` (alongside `customer` and `company`). Balances are
integers in minor units, and **every balance change must produce a Transaction** — so an earnings
screen is a wallet balance plus a filtered transaction feed, not a separate ledger.

Internal wallet operations that already exist and may matter: `{id}/transfer`, `{id}/credit`,
`{id}/topup`, **`{id}/payout`**, `{id}/freeze`, `{id}/unfreeze`, `{id}/recalculate`,
`{id}/transactions`.

**What is missing — this is the PR work to expect:**

1. **Nothing credits a driver on order completion.** The ledger's events are entirely
   invoice/payment-centric — `InvoiceCreated`, `InvoicePaid`, `PaymentFailed`, `PaymentSucceeded`,
   `RefundProcessed`, with three matching listeners. There is no order-completion listener and no
   FleetOps order → wallet credit path anywhere in `server/src`.
2. **There is no rate or payout model** — nothing expresses what a driver earns per order, per stop,
   per kilometre, or as a share. That has to be designed before any crediting can be meaningful, and
   it is as much a product decision as an engineering one.
3. **Confirm the wallet subject for a driver.** `resolveSubject()` returns a **`User`**, but the
   docblock describes driver wallets. Whether a driver's wallet is keyed on `Driver` or on `User`
   changes every query, and getting it wrong is the kind of thing that looks fine until two drivers
   share a user or a driver moves organisation. Settle it before building.
4. **Payout to the driver** — `{id}/payout` exists on the internal namespace; a driver-initiated
   withdrawal, if wanted, needs a consumable route and a gateway decision.

**App side.** H2 Earnings is the exact point where R2 stops — a heading with **no frame behind it**
(§7) — so it needs designing as well as building. The gap spec has it
**config-gated and off by default** with a clear empty state — keep that until the crediting path
actually exists, so the app never shows a plausible-looking zero that is really "not wired up".
Design it as: balance, period selector, a transaction feed with type and direction, and payout
status. Money formatting already exists in `src/v3/format.ts`; use minor units end to end and format
once at the edge.

---

**Tier 2 — the SDK.** `fleetbase-js` still has no stores for `issues`, `fuelReports`, `manifests`,
`workOrders`, `inspections`, `trailers`, `files`, `comments`, `chatChannels`, `orderConfigs`,
`notifications`, `wallet`/`transactions`. v3 reaches these through the adapter directly. Adding the stores is legitimate
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
2. **Inspections** — E3a–E3d, E4, E5 and the E2 gate are all drawn; read them first. The open
   design questions are **trailers** (no frames at all), and the four screens R2 never reached:
   G2 composer, H2 earnings, H3 help, H4 sign out, plus section I.
2a. **Localisation** — which locales ship first, and is RTL in scope for v3.0? Both answers change
   layout work across all 32 existing screens, so they are wanted early, not late.
2b. **Earnings** — what does a driver actually earn (per order / per stop / per km / a share)? No
   rate model exists anywhere, and nothing can be credited until that is decided.
3. **Inspections rebase** — 976 commits is a large rebase. Confirm the owner wants it rebased onto
   the current release branch rather than re-cut fresh from today's `main`.
4. **Scope of the driver inspection API** — the proposed routes in §6 are a proposal, not a
   specification. Get them agreed before implementing, since they set the contract.
5. **Turn-by-turn** (correction 4 in the gap spec) — Driving glance is currently scoped to next-stop
   + hand-off. Confirm that stays for v3.0.
6. **Phone masking** (correction 3) — specified as the right behaviour but has no backing capability
   anywhere in FleetOps. Build it as a FleetOps feature, or drop it from the design?
