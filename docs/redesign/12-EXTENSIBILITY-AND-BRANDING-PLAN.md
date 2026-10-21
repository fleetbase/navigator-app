# 12 — Extensibility and branding: implementation plan

Status: **built** on `release/v3.0.0` (2026-10-21). Proposed 2026-10-21 after studying storefront-app
**v0.1.0** (PR fleetbase/storefront-app#64, where its screen registry and branding system landed) and the
v3 tree; §0 records the owner's decisions, which supersede the proposal where they differ. The working
reference is now [docs/branding.md](../branding.md), [docs/extensibility.md](../extensibility.md) and
[docs/client-builds.md](../client-builds.md).

## 0. Decisions (owner, 2026-10-21)

| # | Question | Decision | Effect on this plan |
|---|---|---|---|
| 1 | Override contract | **Same as storefront** | An override receives `{ route, navigation, DefaultScreen }`; the route adapters moved out of DriverTabs into `navigation/routes/*` and are the defaults (§3.3's presentational contract is superseded) |
| 2 | Loading model | **Match storefront** | Lazy `import()` per screen, Suspense, boot preload, and Metro's dev `lazy=false` rewrite (§3.3's synchronous model is superseded) |
| 3 | zod | **Yes** | `zod@^3.25.76`, as storefront |
| 4 | Component slots | **A small subset relevant to Navigator** | `auth.signIn`, `shell.appHeader`, `shell.tabBar`, `orders.orderCard`, `route.stopRow` (§3.4's longer list is superseded) |
| 5 | Remote branding | **Later** | Phase 8 unchanged |
| 6 | Shared package | **Port now** | Ported, not shared |
| 7 | iOS bundle id from env | **Yes** | `PRODUCT_BUNDLE_IDENTIFIER = $(APP_IDENTIFIER)`, default in `ios/Config.xcconfig` |
| 8 | Pilot | **No pilots** | Each client's app is its own repository pulling from upstream; no managed branches (Phase 7 is docs only) |
| 9 | Branch | **Directly on `release/v3.0.0`** | No feature branch |

The goal is the storefront model, adapted to Navigator: a self-publisher keeps a fork that differs from
upstream only by a `brand/` folder, so `git merge upstream/<tag>` never conflicts, and inside that folder
they can

1. **brand** the app — colours, schemes, type, radii, logo, icon, splash, tabs, menus, features — through
   one typed, versioned, validated file, and
2. **extend** it — replace or wrap screens and selected components, add routes, tabs and menu items, add
   copy — through one typed extensions file, compiled in, never downloaded.

---

## 1. What storefront v0.1.0 does (the reference)

### 1.1 Branding (`brand/storefront.brand.ts`)

- `defineBranding({ schemaVersion: 1, colors, appearance, components, shape, assets, boot, navigation,
  typography, screens })`, validated with zod. Every object is `.strict()`.
- **Forgiving validation**: a bad value is dropped on its own with an issue; resolution always yields a
  complete `ResolvedBranding`. An unsupported `schemaVersion` drops the whole source.
- **Layered sources**: defaults → legacy `.env` keys (29 mapped) → brand file → `__DEV__` preview from
  storage. Colour overrides land on the final preset; WCAG pairs are checked (4.5:1 / 3:1) and reported,
  and a source marked `enforceContrast` has failing keys reverted.
- **Themes generated at build time** from the resolved branding (all presets precompiled), plus derived
  roles (`primaryForeground` via `readableOn`, `*Soft`, interaction scale). At runtime only colours and
  light/dark can change (`addTheme` registers a `…Brand` theme when resolved colours differ).
- `src/ui` primitives read radii, button fill, chip style and type scale from build branding.
- Native: `brand/app-icon.png` and `brand/splash-screen.png` feed `yarn generate:app-icon` /
  `generate:launch-screen`; `brand/fonts/` is linked by `react-native-asset` in the pipeline. App name
  and bundle id stay in `.env`/CI, not in the brand file.
- Remote (server-published) branding is designed for but **not implemented**.

### 1.2 Extensions (`brand/storefront.extensions.ts`)

- **Screen overrides by stable id** (`'store.home'`, 37 ids, `domain.screen`). Route names may change;
  ids are a public contract. Params are typed per id (`ScreenParamMap`, with a compile-time coverage
  check).
- Navigators never import overridable screens; they register `screenSlot(id)`, a stable per-id component
  that resolves default / override / variant from context, renders the override with
  `{ route, navigation, DefaultScreen }`, and falls back to the default if the override fails to load,
  exports a non-component or throws; if the default fails too, a themed error view.
- **Variants**: compiled-in alternatives selected declaratively (from branding or the extensions file).
- **Custom routes** (added to every stack of an edition; core names win) and **custom tabs**
  (`initialRoute`, icon, label, position).
- **Copy**: `brand/translations/<locale>.json` deep-merged over the app's strings.
- `scripts/link-brand.js` (run from babel config, metro config, postinstall, typecheck) writes
  `src/generated/*` re-exporting the brand files or the root templates — relative-path codegen, no
  module aliases.
- Enforcement: an ESLint `no-restricted-imports` rule plus a Jest mirror test so navigators can't import
  overridable screens; strict typecheck includes `brand/**`.
- **No component-level slots** (customisation below screen level is branding variants only), no hooks,
  actions, events or menu-item extension points.

### 1.3 Storefront gaps we should not copy

Found while reading v0.1.0; each has a counter-measure in this plan (§8).

1. The lint list of protected screen modules is hand-written and stale (old module names, no
   subdirectory wildcard), so `StoreNavigator` imports `SignInScreen` directly and an `auth.login`
   override doesn't reach the `PhoneLogin` route. Nothing catches it.
2. The docs' screen-id table and the "network.store renders store.home" claim have drifted from code.
3. An override silently loses the default entry's variants; an unknown variant falls back silently.
4. `navigation.tsx` (custom routes/tabs), the variant merge and `link-brand.js` have no tests; there is
   no CI guard for the bundled extensions file (there is one for the brand file).
5. Registry wiring files are excluded from the strict tsconfig, so default screens aren't checked
   against the override contract.
6. Error boundaries never reset; `onError` only logs; no reporter wired.
7. No `schemaVersion` on extensions; `migrations.ts` referenced but missing.
8. A client palette (`true-vegan`) ships upstream; some branding keys are validated but read by nothing
   (`tabBar.background`, most of `storeHeader`).
9. The splash-background generator regex-scans the brand file for the first hex.
10. Lazy `import()` per screen cost a dev-mode Metro rewrite and a first-render loading frame (patched
    with boot preloading) — a web-chunking concern Navigator doesn't have.

---

## 2. Where Navigator v3 is today

- **Boot**: `App.tsx` selects v3 via `NAVIGATOR_V3`; a v2 context layer and `DriverBridge` feed
  `<V3App>` props. `src/v3/App.tsx` owns the v3 provider tree; pre-auth screens (SignIn, OTP,
  SelfHosted) are a local state machine, not routes.
- **Theme (Waypoint)**: `src/v3/theme/` — `palette.ts` (4 schemes: dark default, light, sunlight,
  night; 7 brand presets; status/stop hues; contrast helpers), `themes.ts` (resolves the brand **from
  env at module load**: `NAVIGATOR_BRAND`, `NAVIGATOR_BRAND_PRIMARY`, `CUSTOM_COLORS[_LIGHT|_DARK|_<SCHEME>]`),
  `tokens.ts` (space/radius/type/motion — fixed), `fonts.ts` (Archivo + JetBrains Mono, fixed),
  `status.ts` (closed status registry). `waypointConfig` is created once at import time.
- **Babel's Tamagui plugin points at the v2 `tamagui.config.ts`**, not Waypoint.
- **Navigation**: one 952-line `src/v3/navigation/DriverTabs.tsx`. Five tabs (Today, Route, Orders, Inbox,
  Account), each a native stack; ~45 routes. Each route is a module-scope adapter that turns
  `route`/`navigation` into the presentational screen's props (`withHeader(titleKey, Screen)` puts the
  header inside the Tamagui tree). Screen identity must be stable at module scope. No ParamList types;
  no `linking` config. Tab labels/icons and the Account menu (`LINKS` in `AccountScreen.tsx`) are
  module-private constants.
- **Screens** (`src/v3/screens/`, 44 files) are presentational: ids, `reloadToken`, `on*` callbacks,
  data via hooks. 44 of them deep-import `../ui/<File>` rather than the barrel.
- **Data seams** are already clean and hook-shaped: `useFleetbase()` (adapter, queue), the
  `src/v3/data` hooks, `useRealtime()`, `useDuty()`/`useSync()`, `useSettings()`, plus
  `useDriverId`/`useFeatures`/`useOrganization`/`useSignOut` from DriverTabs.
- **i18n**: `src/v3/i18n` over i18n-js, catalogues `translations/en.json` + `es.json` (shared with
  v2), parity test, `addCatalogue()` that *replaces* a locale.
- **Native branding**: Android app name / id from env; iOS display name from env, **iOS bundle id
  hardcoded** (`project.pbxproj:330,362`); icons and splash generated from `assets/` by existing
  scripts; **splash background hardcoded `#111827`**, not Waypoint's `#0B1017`; fonts linked statically.
- **No `zod`** in the project.
- **Client builds today are long-lived branches** (`app/gigmodal`, `app/routetrail`,
  `app/dosh-on-dev-v2.0.9`, `app/fleetbase`). Their diffs are almost entirely app icons, boot-splash
  logos, fastlane metadata and CI files — exactly what `brand/` plus generated assets replaces.

---

## 3. Target design for Navigator

### 3.1 The client-build layout

```
brand/                              # only in a client fork; upstream never ships it
  navigator.brand.ts                # defineBranding({ schemaVersion: 1, ... })
  navigator.extensions.ts           # defineNavigatorExtensions({ schemaVersion: 1, ... })
  screens/                          # override / variant / custom-route screens
  components/                       # component overrides
  translations/<locale>.json        # deep-merged over translations/*.json
  fonts/<PostScriptName>.ttf|otf
  assets/                           # logo.png etc. (referenced from the brand file)
  app-icon.png                      # 1024×1024
  splash-screen.png
navigator.brand.ts                  # upstream template: defineBranding({ schemaVersion: 1 })
navigator.extensions.ts             # upstream template: defineNavigatorExtensions({ schemaVersion: 1 })
src/v3/generated/                   # written by scripts/link-brand.js — git-ignored
```

`scripts/link-brand.js` is a port of storefront's: it picks `brand/<file>` else the root template and
writes `src/v3/generated/{brand-config,brand-extensions,brand-translations,brand-fonts,brand-assets}.ts`
with `writeIfChanged`. It runs from `babel.config.js`, `metro.config.js`, `postinstall`,
`typecheck`, and `yarn brand:link`. Restart Metro after adding or removing a brand file.

**Supported client API** (documented, semver-protected; everything else under `src/` may change):
`src/v3/extensions` (define functions, types, `SCREEN_IDS`, `COMPONENT_IDS`), `src/v3/branding`
(`defineBranding`, `useBranding`), `src/v3/ui` (barrel), `src/v3/theme` (tokens, `describeStatus`),
`src/v3/i18n` (`useTranslation`), and the data/realtime/shell hooks listed in §2.

### 3.2 Branding (`navigator.brand.ts`, schema v1)

Navigator-specific vocabulary — Waypoint tokens and schemes, not storefront's semantic keys.

| Section | Fields | Default | Feeds |
|---|---|---|---|
| `name` | string ≤ 80 | — | AppHeader fallback, About |
| `colors.preset` | `keyof brandPresets` (fleetbase, blue, red, green, indigo, orange; drop `acme`) | `fleetbase` | `themes.ts` |
| `colors.primary` / `primaryDeep` / `onPrimary` / `sunlightPrimary` | hex | from preset; `onPrimary` via `legibleOn`; `sunlightPrimary` derived to ≥ 7:1 on white if absent | `brandFor()` |
| `colors.tokens.{all,light,dark,sunlight,night}` | `Partial<Record<WaypointTokenKey, Color>>` | `{}` | replaces `CUSTOM_COLORS*`; applied last, as today |
| `appearance` | `defaultScheme: 'system' \| SchemeName`, `schemes: SchemeName[]` (must include `dark`), `allowUserToggle` | `system`, all four, `true` | settings store + Settings picker |
| `typography.{body,heading,mono}` | `{ family, faces: { '400': PostScriptName, … } }` | Archivo / Archivo / JetBrains Mono | `fonts.ts` |
| `typography.scale` | 0.9–1.2 (narrower than storefront: glanceable tier must stay legible) | 1 | `tokens.type` |
| `shape.radius` | `compact` 4–16, `hero` 8–28 | 10 / 18 | `tokens.radius` |
| `assets.logo` / `assets.logoDark` | `{ brand: 'assets/logo.png' }` or `{ url: https }` | none (org initial, as today) | AppHeader, SignIn |
| `navigation.tabs` | ordered subset of `Today, Route, Orders, Inbox, Account` + custom tab names; `Account` required | all five | DriverTabs |
| `navigation.defaultTab` | tab name | `Today` | DriverTabs |
| `navigation.tabOverrides` | `{ [Tab]: { icon?: TabIconName, labelKey?: string } }` | `{}` | TabBar |
| `account.hiddenLinks` | Account `LINKS` route names | `[]` | AccountScreen |
| `features` | `earnings, documents, trailers, inspections, fuel, issues, offers, chat, …` booleans | current behaviour | `Features` context (AND-ed with server/org state, never forcing a feature on) |
| `auth` | `methods: ('phone' \| 'email')[]`, `allowSelfHosted` | `['phone']`, `true` | DriverBridge props (today hardcoded) |
| `statuses` | `{ [customCode]: { tone: StatusTone, labelKey? } }` | `{}` | `status.ts` (maps FleetOps order-config custom statuses onto existing tones, so glyph + shape stay — never colour-only) |
| `screens` | `{ [ScreenId]: { variant } }` | `{}` | screen registry |
| `boot.background` | hex | Waypoint dark `#0B1017` | splash generator + native colours |

**Not in the brand file**: API host/keys, socket config, `APP_NAME`, `APP_IDENTIFIER`,
`APP_LINK_PREFIX`, store credentials — they stay in `.env` / CI secrets.

**Design invariants the schema must not let a brand break** (doc 08 §7): night scheme ignores the
brand primary (amber is a safety choice) — not exposed; `dark` stays available; status is never
colour-only; tabular numerals and monospaced identifiers are not configurable.

**Resolution** (`src/v3/branding/resolve.ts`, pure TS) — sources in order:
1. defaults;
2. legacy env (`NAVIGATOR_BRAND`/`APP_THEME`, `NAVIGATOR_BRAND_PRIMARY`, `CUSTOM_COLORS*`,
   `FEATURE_EARNINGS`), so existing builds keep working unchanged;
3. `brand/navigator.brand.ts` (via `src/v3/generated/brand-config`);
4. `__DEV__` preview from MMKV key `v3.branding-preview` (`enforceContrast: true`).

Validation (`validate.ts`) uses **zod** (new dependency, same major as storefront) with storefront's
per-value fallback and issue list; issues are `console.warn`ed once in `__DEV__`. Contrast checks use
the existing `contrastRatio`/`legibleOn` across **all four schemes**: `textPrimary/background`,
`textPrimary/surface`, `onPrimary/primary` (4.5), `textSecondary/background` (3), and sunlight primary
on white (7). zod stays out of the theme-building path (`resolve` and `buildThemes` take sanitised
plain objects), so pointing the Tamagui extractor at Waypoint later doesn't hit storefront's
"zod resolves to its type declarations" problem.

**Theme pipeline**: `themes.ts` stops reading env and becomes
`buildWaypointThemes(resolved: ResolvedBranding)`; `theme/index.ts` builds `waypointConfig` from
`getBuildBranding()` (cached per bundle). Fonts and radii flow the same way. **Build-time only in
v1** — runtime switching stays as today (scheme preference only). Remote/org branding is §6 Phase 8.

### 3.3 Screen registry

**Ids** (`src/v3/extensions/screens/screen-ids.ts`), `domain.screen`, a public contract — never
renamed, only added:

| Area | Ids |
|---|---|
| Auth (pre-auth state machine) | `auth.signIn`, `auth.otp`, `auth.selfHosted` |
| Today | `today.home`, `navigation.handoff` |
| Route | `route.home`, `route.stopDetail`, `route.stopExecution`, `route.optimise` |
| Orders | `orders.list`, `order.detail`, `order.timeline`, `order.proof`, `order.destination`, `order.editPayloadItem`, `order.entityDetail`, `offers.list` |
| Inbox | `inbox.list`, `inbox.conversation`, `inbox.newConversation` |
| Account | `account.home`, `account.profileEdit`, `account.orgSwitcher`, `account.settings`, `account.help`, `account.syncQueue`, `account.documents`, `account.earnings` |
| Reports | `fuel.log`, `fuel.report`, `fuel.create`, `issues.list`, `issues.detail`, `issues.create` |
| Vehicle | `vehicle.mine`, `vehicle.change`, `vehicle.trailer` |
| Inspections | `inspection.start`, `inspection.checklist`, `inspection.review`, `inspection.result`, `inspection.detail` |

**Not overridable** (direct imports, documented): the permissions primer (it carries the mandatory
Google Play / App Store background-location disclosure), the not-enabled honest states, error/failure
states, and the shell (AppHeader, OfflineBar, Duty sheet — those are component slots, §3.4).

**Key divergence from storefront — the override contract is the presentational screen's props, not the
route.** Navigator already splits every route into a DriverTabs adapter (params + navigation →
callbacks) and a presentational screen. Overriding at the presentational layer means a client screen
gets `orderId`, `reloadToken`, `onOpenStop`, `onBack`… already wired, and never re-implements
navigation glue:

```ts
export type NavigatorScreenProps<Id extends ScreenId> = ScreenPropsMap[Id] & {
  DefaultScreen: React.ComponentType<ScreenPropsMap[Id]>;
};
export type NavigatorScreen<Id extends ScreenId> = React.ComponentType<NavigatorScreenProps<Id>>;
```

`ScreenPropsMap` is **written out explicitly** in `extensions/screens/contracts.ts`, one exported
`…ScreenProps` type per screen, with a compile-time check that every default satisfies its contract
and that the map covers `SCREEN_IDS`. It is not inferred from `ComponentProps<typeof X>`, because then
any internal props change would silently break client builds. Changing a contract becomes a deliberate,
release-noted act. A custom screen that needs more than the props uses the public hooks
(`useNavigation`, data hooks).

**Second divergence — synchronous, not lazy.** Navigator is native-only in practice, so per-screen
`import()` buys nothing and costs storefront's Metro rewrite plus a loading frame. Entries are
`{ component }` (or `{ load: () => require(...) }` thunks, evaluated on first render, to break import
cycles with `brand/` files that import `src/v3`). No Suspense, no preload step.

```ts
type ScreenEntry<Id> = { component?: NavigatorScreen<Id>; load?: () => NavigatorScreen<Id> | { default: NavigatorScreen<Id> };
                         variants?: Record<string, ScreenEntry<Id>>; platforms?: ('ios' | 'android')[] };
```

**Wiring**: `screenSlot(id)` returns a stable, memoised-per-id component (fits DriverTabs' "screen
identity" rule). DriverTabs adapters render `<Slot … />` instead of `<OrderDetailScreen … />`; the
`App.tsx` pre-auth state machine renders `auth.*` slots. Resolution order: selected variant (from
branding or extensions; the override inherits the default entry's variants unless it redeclares them) →
override → default. Unknown variants or ids warn in prod and throw in `__DEV__`.

**Failure behaviour**: an override that throws on load or render falls back to `DefaultScreen` with the
same props; if the default fails, the existing `FailureState`. Boundaries reset on `route.key` /
`reloadToken` change (pull-to-refresh retries the override). `onError` goes to a reporter hook
(`extensions.onScreenError`, default `console.error`).

### 3.4 Component registry (beyond storefront)

Storefront has none; you asked for component customisation, so Navigator adds a **curated** set of
component slots, not every `ui/*` export. Each slot is a stable, documented contract:

- **Shell**: `shell.appHeader`, `shell.tabBar`, `shell.offlineBar`, `shell.dutyPill`
- **Cards and rows**: `ui.orderCard`, `ui.offerCard`, `ui.vehicleCard`, `ui.manifestCard`, `ui.stopRow`, `ui.listRow`
- **Status and identity**: `ui.statusPill`, `ui.statusMarkerPin`, `ui.identifier`
- **States**: `ui.emptyState`, `ui.errorState`, `ui.banner`
- **Orders**: `order.activityStepper`, `order.sections.*` (one per section in `orderDetail/OrderSections.tsx`: summary, customer, payload, documents…), so a client can replace one section without forking the whole order detail screen

**Mechanism** — no screen migration needed. Each slot is exported under the existing name from its
existing file, so the 44 deep imports keep working:

```ts
// ui/Cards.tsx
const OrderCardBase = (props: OrderCardProps) => { … };
export const OrderCard = componentSlot('ui.orderCard', OrderCardBase);
```

`componentSlot(id, Default)` checks the generated brand extensions **at module load**. With no override
it returns `Default` itself: zero cost, which matters for `StopRow` inside long lists. With an override
it returns a wrapper that renders the override with `{ ...props, Default }` inside an error boundary
that falls back to `Default`. Override entries are lazy thunks (`load: () => require('./components/X')`),
so `brand/` files can import `src/v3/ui` without a circular-import deadlock. Props types per id live in
`extensions/components/contracts.ts`, under the same explicit-contract rule as screens. Tests inject
overrides with `jest.doMock` of the generated module, the same pattern as `theme/__tests__/white-label.test.ts`.

### 3.5 Other extension points (`navigator.extensions.ts`)

```ts
export default defineNavigatorExtensions({
  schemaVersion: 1,
  screens: { 'order.detail': { load: () => require('./screens/OrderDetail') } },
  screenVariants: { 'today.home': 'compact' },
  components: { 'ui.orderCard': { load: () => require('./components/OrderCard') } },
  routes: { Rewards: { load: () => require('./screens/Rewards'), stacks: ['Account'], titleKey: 'Brand.rewards', presentation: 'card' } },
  tabs: { RewardsTab: { initialRoute: 'Rewards', icon: RewardsIcon, labelKey: 'Brand.rewardsTab' } },
  accountMenu: [{ route: 'Rewards', labelKey: 'Brand.rewards', position: 3 }],
  sessionComponents: [TelematicsBridge],
  onScreenError: (error, ctx) => Sentry.captureException(error, { extra: ctx }),
});
```

- **Routes** are added to the named stacks (or `'all'`), wrapped in `withHeader` when `titleKey` is
  set (so the header renders inside Tamagui). PascalCase names; a clash with a core route is rejected.
  A shared route must list every stack it is navigated from (this follows the existing rule for
  NavigationHandoff).
- **Tabs**: at most **5 visible**, which keeps the Waypoint tab-bar design. A custom tab therefore
  requires hiding a core tab with `navigation.tabs` in branding; `Account` can't be hidden. The tab's
  stack gets its initial route plus the shared routes (NavigationHandoff, OrderDetail).
- **Account menu items**: appended to `LINKS`, with optional `feature` gating.
- **`sessionComponents`**: headless components mounted at session scope next to `PushRouter` and
  `DriverChannel`, for client integrations such as telematics or analytics. They are inside every
  provider, so all the hooks are available.
- **Copy**: `brand/translations/<locale>.json` is deep-merged (`i18n/index.ts` gets a
  `mergeCatalogue`; `addCatalogue` keeps its replace semantics). Brand-only locales must also be
  enabled in `LOCALES`. Strings belong in a `Brand.*` namespace by convention.
- **Statuses**: declarative, in branding (§3.2).

Deliberately **not** offered in v1: middleware on the adapter, mutation-queue hooks, replacing the
realtime layer, remote or OTA code. These are listed as non-goals in the docs.

### 3.6 Native identity and assets

- `scripts/generate-app-assets.js` (port of storefront's): `generate:app-icon` reads `brand/app-icon.png`
  and falls back to `assets/app-icon.png`, then runs the existing `fix-android-app-icons.js`.
  `generate:launch-screen` reads `brand/splash-screen.png`, with a background from the **resolved
  branding** (`boot.background`; import the resolver rather than regex-scanning the file the way
  storefront does), then runs `fix-android-launch-screen.js`.
- Fix the hardcoded `#111827` splash: the default becomes Waypoint dark `#0B1017`, so the hand-off from
  boot-splash to app has no colour jump.
- iOS bundle id comes from `APP_IDENTIFIER` through `Config.xcconfig`
  (`PRODUCT_BUNDLE_IDENTIFIER = $(APP_IDENTIFIER)`), matching Android. This removes the most common
  pbxproj conflict in client branches.
- Fonts: `react-native.config.js` adds `./brand/fonts` when it exists. Linking with `react-native-asset`
  runs in the pipeline, and the docs say not to commit the result.
- CI: one `profile-release` path that takes `brand/` from the fork, or an S3 profile copied into
  `brand/` (not `assets/`, which is where storefront's workflow still writes).
- Fastlane store metadata (`ios/fastlane/metadata`, the bulk of the dosh branch) moves to
  `brand/store-metadata/` and is copied in by the lane.

---

## 4. Enforcement and tests

Each item addresses one of the storefront gaps in §1.3.

- **Boundary test that is derived, not hand-listed**: it enumerates the modules in
  `extensions/screens/default-screens.ts` and fails if `navigation/**` or `App.tsx` imports any of them
  directly. A screen added to the registry is protected automatically, and there is no stale list.
- **Doc tables generated from code**: `yarn extensions:docs` writes the screen-id and component-id
  tables into `docs/extensibility.md`, and a test fails if they are out of date.
- **Registry tests**, a port of storefront's 20 cases plus:
  - variant inheritance;
  - an unknown variant warns;
  - the boundary resets on `reloadToken`;
  - the zero-cost passthrough for component slots with no override;
  - lazy-thunk cycle safety.
- **Navigation-extension tests**: route injection, name clashes, the 5-tab cap, `Account` cannot be
  hidden, tab ordering, menu items, `sessionComponents` mounting.
- **Branding tests**:
  - per-value fallback;
  - each legacy-env mapping;
  - contrast across the 4 schemes;
  - **theme parity**: with an empty brand file, the generated themes equal today's `themes.ts` output
    key for key (capture a fixture first). This is the guarantee that the work changes nothing for
    existing builds;
  - the existing `white-label.test.ts` rewritten over the resolver.
- **CI guards** for the bundled `brand/` (or template) files: branding has zero issues, extensions
  validate, and every override satisfies its contract (`tsc` over `brand/**`).
- **Strict typecheck covers the wiring**: `tsconfig.v3.json` includes `src/v3/extensions/**`,
  `src/v3/branding/**`, `brand/**`, and both root templates.
- `link-brand.js` and `generate-app-assets.js` get unit tests (temp-dir fixtures).
- Every existing static guard keeps running over the slot-wrapped code: no hard-coded copy, themed
  screen backgrounds, status coverage, every screen rendered under every scheme.

---

## 5. Divergences from storefront, summarised

| Topic | Storefront v0.1.0 | Navigator plan | Why |
|---|---|---|---|
| Override contract | route props + `DefaultScreen` | presentational props + `DefaultScreen` | Navigator already separates adapter and screen, so clients skip the navigation glue |
| Loading | lazy `import()` + Suspense + boot preload | synchronous, lazy thunks only to break cycles | native-only app; avoids the Metro rewrite and the loading frame |
| Component slots | none | curated list, zero-cost when not overridden | requested; list rows need to stay fast |
| Menu items, headless components, error reporter | none | `accountMenu`, `sessionComponents`, `onScreenError` | real driver-app needs: client menus, telematics, crash reporting |
| Status mapping | n/a | `branding.statuses` | FleetOps order configs define custom statuses |
| Lint list | hand-written (stale) | derived from the registry | prevents silent bypass |
| Extensions version | none | `schemaVersion: 1` | room for migrations |
| iOS bundle id | hardcoded | from `APP_IDENTIFIER` | removes pbxproj conflicts |
| Shared code | — | ported, not shared (yet) | see open decision 6 |

---

## 6. Phases

Each phase is its own PR into `feature/v3-redesign` (or straight into `release/v3.0.0`, depending on where
the design iteration stands). Every phase leaves the app behaving exactly as before unless a `brand/`
folder is present.

| # | Phase | Deliverables | Size |
|---|---|---|---|
| 0 | **Groundwork** | `scripts/link-brand.js` + hooks (babel, metro, postinstall, typecheck, `brand:link`); `src/v3/generated/` git-ignored; root templates; `brand/` included in tsconfig and the CI typecheck; add `zod`; theme-parity fixture captured from today's `themes.ts` | S |
| 1 | **Branding core** | `src/v3/branding/` (schema, defaults, legacy-env, validate, resolve, contrast, define, `useBranding`); `themes.ts` → `buildWaypointThemes(resolved)`; `waypointConfig` from build branding; `appearance` wired into the settings store and the Settings picker; dev preview; tests in §4 | M |
| 2 | **Branding reach** | typography and fonts, radius, `typography.scale`; logo in AppHeader and SignIn; `navigation.tabs`/`defaultTab`/`tabOverrides`; `account.hiddenLinks`; `features` (replacing `FEATURE_EARNINGS`); `auth` (out of the DriverBridge hardcodes); `statuses`; `boot.background` | M |
| 3 | **Screen registry** | ids, explicit contracts, defaults, registry, `screenSlot`, boundaries, reporter; DriverTabs adapters and the pre-auth machine switched to slots; variants; derived boundary test; generated docs table | L (DriverTabs churn) |
| 4 | **Navigation extensions** | custom routes, tabs (5-cap), Account menu items, `sessionComponents`, translation deep-merge (`mergeCatalogue`) | M |
| 5 | **Component registry** | `componentSlot`; the curated slot list wrapped in place; contracts; OrderSections split into slots; tests | M |
| 6 | **Native and pipeline** | `generate-app-assets.js` from `brand/`; splash colour fixed; iOS bundle id from env; fonts from `brand/`; CI profile path into `brand/`; fastlane metadata from `brand/` | M |
| 7 | **Docs and pilot** | `docs/branding.md`, `docs/extensibility.md`, `docs/client-builds.md`; convert one client branch to a fork with `brand/` as the pilot (routetrail is the smallest diff), then retire the per-client branches | S–M |
| 8 | **Later: remote branding** | org-level branding published from the Fleetbase console (needs a FleetOps settings endpoint), layered as source 5 with `enforceContrast`, colours only at runtime through `addTheme`; and possibly a shared `@fleetbase/app-branding` package with storefront | — |

Phases 0–2 touch the theme and config, not screens, so they can run alongside the on-device design
iteration. Phase 3 rewrites most of DriverTabs, so it should start once that iteration has quietened
down, or land quickly with frequent merges, to avoid painful conflicts with design tweaks.

---

## 7. Open decisions

1. **Override contract level** — presentational props (recommended) or route props as in storefront.
2. **Loading model** — synchronous with lazy thunks (recommended) or lazy `import()` to mirror storefront.
3. **Add `zod`** — recommended, for parity with storefront's validator and error messages.
4. **Component slot scope** — the curated list in §3.4 (recommended), smaller, or "every `ui` export".
5. **Remote / org branding** — later, in Phase 8 (recommended; it needs an API), or now.
6. **Share code with storefront** — port now and extract a shared package once both have stabilised
   (recommended), or extract the package first.
7. **iOS bundle id from env** — recommended.
8. **Pilot client** — routetrail (smallest diff), gigmodal, or dosh.
9. **Target branch** — `feature/v3-redesign` per phase (matches the current flow) or `release/v3.0.0`.

---

## 8. Storefront gaps → Navigator counter-measures

| Storefront gap (§1.3) | Counter-measure |
|---|---|
| 1. Stale protected-module list | Boundary test derived from the default-screens registry (§4) |
| 2. Docs drifted from code | Generated id tables, with a freshness test |
| 3. Variants lost on override; unknown variant silent | Override inherits default variants; unknown variant warns, and throws in dev |
| 4. Untested routes, tabs, variant merge, link script; no extensions CI guard | Tests for each (§4) and a bundled-extensions guard |
| 5. Wiring excluded from strict typecheck | `tsconfig.v3.json` covers extensions, branding and `brand/` |
| 6. Boundaries never reset; no reporter | Reset on `route.key`/`reloadToken`; `onScreenError` |
| 7. No extensions version; missing migrations | `schemaVersion` on both files; `migrations.ts` created with v1 as a no-op |
| 8. Client palette upstream; dead keys | No client presets upstream (drop `acme`); a test that every schema key has a reader |
| 9. Regex splash colour | Splash colour from the resolver |
| 10. Lazy-loading cost | Synchronous registry |
