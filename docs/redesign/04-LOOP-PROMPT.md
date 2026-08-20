# Loop prompt — implement the Navigator redesign to completion

Run with `/loop <paste the block below>`. Each iteration should land **one
vertical slice**, fully finished, then stop. Do not start a second slice in the
same iteration.

---

## The task

Continue implementing the Navigator v3 redesign in `src/v3/`. Pick the single
highest-priority unfinished slice from the ledger in
`docs/redesign/05-IMPLEMENTATION-LEDGER.md`, implement it completely, verify it,
update the ledger, and commit. Then stop.

## What "one slice" means

A slice is one screen or one flow, finished end to end:

1. **Screen(s)** built from the Waypoint components in `src/v3/ui`. Never add a
   parallel treatment — if something genuinely new is needed, add it to the
   component library with all six states and say so in the commit.
2. **Every user-visible string via `t()`.** No literal copy in JSX. Keys added to
   `translations/en.json` under the screen's namespace (see i18n rules below).
3. **Data wired for real** — reads through the store/selectors in `src/v3/data`,
   writes through the adapter in `src/v3/api` so they queue when offline. No
   mock data left behind, no `TODO: wire up`.
4. **All states rendered**: loading (skeleton), empty, error, offline, and any
   state the design frame shows. If the design shows a failure or a blocked
   state, build it — those are the ones that get skipped and then bite.
5. **Tests** — render in all four schemes, plus assertions for the behaviour
   that actually matters in that slice (not snapshot-only).
6. **Verified on the simulator** where the slice is visual.

## i18n rules — non-negotiable

The v2 app is effectively unlocalised: `translations/` has only `en.json` with
67 keys, and 6 of 34 screens use `useLanguage`. Retrofitting is far more
expensive than authoring correctly, so every v3 slice is localised from the
start.

- Namespace per screen, matching the route name: `todayScreen.*`,
  `stopExecution.*`, `vehicleInspection.*`.
- Shared vocabulary goes in `common.*` — do not duplicate "Cancel" per screen.
- **Status labels resolve through the registry**, never hardcoded: use
  `describeStatus(status).labelKey` with `defaultLabel` as the fallback. The
  design's wording wins ("En route", not the humanised "Driver Enroute").
- Keys are descriptive, not the English text: `stopExecution.scanRemaining`,
  not `stopExecution.twoItemsLeft`.
- **Pluralisation and interpolation** must use the i18n library's mechanisms,
  never string concatenation — "1 stop" / "2 stops" is a plural rule, and
  `{{count}} of {{total}}` is interpolation.
- Design for ~30% text expansion: no fixed-width text containers, no
  `numberOfLines={1}` on anything a driver must read in full.
- **Identifiers are never translated and never truncated** — tracking numbers,
  entity IDs, serials, plates, coordinates. Render them through `<Identifier>`.
- Dates and numbers go through the formatters in `src/v3/format.ts`, which must
  honour the driver's locale and unit preference from `src/v3/settings`.

## Rules that hold across every slice

- **Config-driven flows are dynamic renderers.** The order status stepper and
  the stop-execution sequence come from `order-configs`, not a fixed list. The
  R2 frames show one example each; build for 2, 5 and 7 steps. This is the
  single most likely source of rework — get it right the first time.
- **Degrade honestly.** If an organisation has not enabled something, or the
  endpoint does not exist yet, render a truthful "not available" state. Never
  fabricate data to fill a frame.
- **Offline is a state, not an error.** Mutations go through the queue and the
  UI proceeds optimistically; reads that fail surface an error state.
- **No `isDarkMode` branching.** If a component needs to know the scheme, the
  token layer is wrong — fix the tokens.
- **Never widen scope silently.** If a slice turns out to need backend work
  that does not exist, stop, record the blocker in the ledger, and pick the
  next unblocked slice instead.

## Verification each iteration

```
yarn typecheck && yarn lint && yarn test
```

All three must pass before committing. For visual slices, also build and drive
the simulator (Metro on 8083 — Docker holds 8081/8082):

```
npx react-native start --port 8083
```

Then attach the simulator panel, build, launch, and screenshot the slice in
dark and light at minimum. Device runs have already caught bugs unit tests
could not — treat a green suite as necessary, not sufficient.

**Before concluding a control is broken, screenshot immediately before the tap
and confirm nothing is overlaying it.** Native permission alerts from
background-geolocation and the LogBox dev toast both swallow taps, and the
alerts appear on a delay — a screenshot taken a few actions earlier looks
clear. See the device-verification note in the ledger.

## Definition of done for the whole effort

Every screen in `docs/redesign/03-DESIGN-GAP-SPEC.md` and the R1/R2 design
documents is implemented, localised, wired to real endpoints, tested, and
verified on device; the `NAVIGATOR_V3` flag can be removed and `App.v2.tsx`
plus `src/components`, `src/screens` and `src/navigation` deleted.

## Stop conditions

Stop the loop and report if:

- The ledger has no unblocked slices left (everything remaining needs backend
  work) — say which endpoints are the blockers.
- Two consecutive iterations fail verification for the same reason.
- A slice would require changing the v2 tree in a way that risks main.
