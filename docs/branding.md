# Branding

A build's look — colours, schemes, type, radii, logo, tabs, menus, features and launch artwork — is configured in one typed, versioned file: `brand/navigator.brand.ts`. It is declarative data only; code-level changes (replacing screens or components, adding routes) go in `brand/navigator.extensions.ts` ([extensibility.md](extensibility.md)). How a client build is laid out and upgraded is in [client-builds.md](client-builds.md).

Branding applies to the v3 app (`NAVIGATOR_V3=true`). The v2 tree keeps its own theme until cutover.

## Sources, lowest priority first

1. **Defaults** — the Waypoint design as shipped.
2. **Legacy env keys** — `NAVIGATOR_BRAND`, `APP_THEME`, `NAVIGATOR_BRAND_PRIMARY`, `CUSTOM_COLORS`, `CUSTOM_COLORS_LIGHT`, `CUSTOM_COLORS_DARK`, `CUSTOM_COLORS_SUNLIGHT`, `CUSTOM_COLORS_NIGHT`, `FEATURE_EARNINGS`. Builds configured this way look exactly as they did before the brand file existed (`src/v3/theme/__tests__/theme-parity.test.ts`).
3. **`brand/navigator.brand.ts`** — or the root template `navigator.brand.ts` when a build has none.
4. **Development preview** — `__DEV__` only: a branding config stored as JSON under the MMKV key `v3.branding-preview` is layered on top, so a look can be tried without rebuilding. Colours that fail the contrast checks are reverted rather than shown.

A remote, published configuration (from the Fleetbase console) will be layered on top in a later release.

## Example

```ts
// brand/navigator.brand.ts
import { defineBranding } from '../src/v3/branding/define';

export default defineBranding({
    schemaVersion: 1,
    name: 'Purbeck Couriers',
    colors: {
        primary: '#0FA36B',
        tokens: { dark: { background: '#08110D' } },
    },
    appearance: { defaultScheme: 'dark', schemes: ['dark', 'light', 'sunlight', 'night'], allowUserToggle: true },
    typography: { body: { faces: { '400': 'Inter-Regular', '600': 'Inter-SemiBold', '700': 'Inter-Bold' } } },
    shape: { radius: { compact: 8, hero: 16 } },
    boot: { background: '#08110D' },
    navigation: { tabs: ['Today', 'Orders', 'Inbox', 'Account'], defaultTab: 'Orders', tabOverrides: { Today: { labelKey: 'Brand.tabs.shift' } } },
    account: { hiddenLinks: ['FuelLog'] },
    features: { earnings: true },
    statuses: { awaiting_customs: { tone: 'on_hold', labelKey: 'Brand.status.awaitingCustoms' } },
    screens: { 'order.detail': { variant: 'compact' } },
});
```

## Options

| Option | Values | Default |
|---|---|---|
| `name` | string ≤ 80 | — |
| `colors.preset` | `fleetbase`, `blue`, `red`, `green`, `indigo`, `orange`, `acme` | `fleetbase` |
| `colors.primary` | `#rrggbb`. The fields below are derived from it when not given | preset's |
| `colors.primaryDeep` | `#rrggbb` — pressed / deep variant | derived (20% darker) |
| `colors.onPrimary` | `#rrggbb` — text and icons on the brand colour | white or ink, whichever reads better |
| `colors.sunlightPrimary` | `#rrggbb` — must hold 4.5:1 on white | derived (darkened until it does) |
| `colors.tokens.{all,lightModes,darkModes,dark,light,sunlight,night}` | `{ <token>: colour }` — any Waypoint theme token (`background`, `surface`, `surfaceRaised`, `border`, `textPrimary`, `textSecondary`, `textMuted`, `primaryFill`, …). Applied last: all → mode (light+sunlight, or dark+night) → scheme | — |
| `appearance.defaultScheme` | `system`, `dark`, `light`, `sunlight`, `night`. `system` follows the phone between dark and light | `system` |
| `appearance.schemes` | the schemes a driver may pick | all four |
| `appearance.allowUserToggle` | `false` hides the Settings picker and pins `defaultScheme` | `true` |
| `typography.body` / `heading` / `mono` | `{ faces: { '400': 'PostScriptName', … } }` — files in `brand/fonts` (below). Weights the family doesn't name use the nearest one. `heading` defaults to `body`; keep `mono` monospaced | Archivo / Archivo / JetBrains Mono |
| `typography.scale` | 0.9–1.2, multiplies the type scale (the glanceable tier — ETA, distance — is not scaled) | 1 |
| `shape.radius.compact` / `hero` | 0–20 / 0–32 | 10 / 18 |
| `assets.logo` | `{ url: 'https://…' }`, or `null` for none. Unset uses `brand/logo.png` (and `brand/logo-dark.png` on dark schemes). Shown on the sign-in screen | — |
| `boot.background` | `#rrggbb` — the native launch screen's background | `#0B1017` (Waypoint dark) |
| `navigation.tabs` | ordered list of `Today`, `Route`, `Orders`, `Inbox`, `Account` and custom tab names (`…Tab`), at most 5. Account is always kept | all five |
| `navigation.defaultTab` | a tab name | `Today` |
| `navigation.tabOverrides.<CoreTab>` | `{ icon?: <one of the five tab icons>, labelKey?: string }` | — |
| `account.hiddenLinks` | Account menu route names, e.g. `FuelLog`, `Issues`, `Inspection`. Settings and Help can't be hidden | — |
| `features.earnings` | driver wallet earnings; off shows the honest "not enabled" state | `false` (or `FEATURE_EARNINGS`) |
| `statuses.<status>` | `{ tone, labelKey? }` — a custom FleetOps order-config status (snake_case) shown as one of the design's 11 tones, so it keeps that tone's glyph and marker shape | — |
| `screens.<screenId>.variant` | selects a compiled-in screen variant ([extensibility.md](extensibility.md)) | — |

Not brand options, by design: the night scheme's amber primary (night vision), tabular numerals, monospaced identifiers, and status shapes and glyphs (status is never colour alone).

## Validation

- Every value is checked (zod). An invalid value is dropped on its own, with an issue naming its path; the rest of the file still applies. An unsupported `schemaVersion` drops the whole file.
- Contrast is checked in every scheme but night: on-primary over primary 3:1 (button labels are bold 15pt+), text primary over background and surface 4.5:1, text secondary over background 3:1, the sunlight primary over white 4.5:1. Failures are reported; a preview source has its colours reverted.
- A font family whose files are not in `brand/fonts` (or shipped with the app) is dropped, so text never falls back silently to the system font.
- In development every issue is logged once at startup. **In CI they fail the build**: `src/v3/branding/__tests__/bundled-brand.test.ts` resolves the build's brand file and expects no issues.

## Fonts

1. Put the font files in `brand/fonts/`, each named by its PostScript name: `brand/fonts/Inter-Bold.ttf`.
2. Name the faces in `typography` by PostScript name.
3. In the build pipeline run `npx react-native-asset` (it links `brand/fonts` alongside the app's fonts — see `react-native.config.js`). It edits the native projects, so don't commit its output.

Faces are addressed by PostScript name, not by `fontWeight`: Google Fonts statics put each weight in its own family name, so a family plus a weight does not resolve reliably on iOS.

## App icon and launch screen

- `brand/app-icon.png` — 1024×1024, no transparency → `yarn generate:app-icon`
- `brand/splash-screen.png` — the launch screen logo → `yarn generate:launch-screen` (background from `boot.background`, or `--background #rrggbb`)

Both fall back to `assets/`. They write into `ios/` and `android/`, so run them in the release pipeline rather than committing the result.

## How it is applied

Branding is resolved once when the app starts (`src/v3/branding/build-branding.ts`) and is fixed for the life of the app: the Waypoint themes (`src/v3/theme/themes.ts`), radii and type scale (`tokens.ts`), fonts (`fonts.ts`), the status registry (`status.ts`), the settings defaults and the navigator all build from it when their modules load. Code reads it with `getBuildBranding()` / `useBranding()`; screens never branch on brand names.

The v2 Tamagui config (`tamagui.config.ts`) is what the Tamagui Babel plugin extracts against today. When it is pointed at the Waypoint config at cutover, keep zod out of the config's import path (storefront splits a zod-free `theme-inputs` for exactly this).
