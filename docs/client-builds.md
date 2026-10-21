# Client builds

Each client's Navigator app lives in **its own repository**, created from this one and upgraded by pulling from it. There are no managed per-client branches. Everything a client owns sits in one folder, `brand/`, which this repository never ships, so pulling a new release never touches a client file.

## Layout

```
brand/                              # the client's own folder (committed in the client's repo)
  navigator.brand.ts                # branding — docs/branding.md
  navigator.extensions.ts           # screen/component overrides, routes, tabs — docs/extensibility.md
  screens/  components/             # the client's own screens and components
  translations/<locale>.json        # copy, deep-merged over translations/*.json
  fonts/<PostScriptName>.ttf|otf    # font files named by PostScript name
  logo.png  logo-dark.png           # the sign-in logo (optional)
  app-icon.png                      # 1024×1024, no transparency
  splash-screen.png                 # launch screen logo
.env                                # identity and secrets — never committed
```

Every file in `brand/` is optional; a build with no `brand/` folder is the stock Navigator. Brand files import the app by relative path (`../src/v3/branding/define`, `../../src/v3/ui`).

`scripts/link-brand.js` finds the brand files and writes `src/v3/generated/` (git-ignored) so Metro, Jest and `tsc` all resolve them the same way. It runs from `babel.config.js`, `metro.config.js`, `postinstall` and `yarn typecheck`, and on demand with `yarn brand:link`. **Restart Metro after adding or removing a file in `brand/`**; edits to an existing file are picked up as usual.

## Setting up a client repository

```bash
git clone git@github.com:fleetbase/navigator-app.git acme-navigator
cd acme-navigator
git remote rename origin upstream
git remote add origin git@github.com:acme/acme-navigator.git
git checkout -b main upstream/main
git push -u origin main
```

Then add `brand/`, a `.env` (from `.env.example`), and the release pipeline. Commit `brand/`; never commit `.env`.

## What goes where

| Change | Where |
|---|---|
| Colours, schemes, type, radii, logo, tabs, hidden menu entries, features, custom statuses | `brand/navigator.brand.ts` |
| Replace a screen or one of the component slots, add routes, tabs, menu entries | `brand/navigator.extensions.ts` + `brand/screens`, `brand/components` |
| Copy | `brand/translations/<locale>.json` (by convention, new keys under `Brand.*`) |
| Fonts | `brand/fonts/` + `typography` in the brand file |
| App icon, launch screen | `brand/app-icon.png`, `brand/splash-screen.png` |
| App name, bundle identifier, deep-link scheme | `.env`: `APP_NAME`, `APP_IDENTIFIER`, `APP_LINK_PREFIX` |
| API host and keys, maps, location licence, store credentials | `.env` and CI secrets |

**Leave the rest of the repository alone.** A change to `src/`, `ios/`, `android/` or the root templates (`navigator.brand.ts`, `navigator.extensions.ts`) is a change to upstream code, and conflicts on the next upgrade. If a client needs something the extension points don't allow, ask upstream for a new option, screen id or component id: a generic feature lands upstream switched off by default, and the client turns it on from `brand/`.

### Native identity

The bundle identifier comes from `APP_IDENTIFIER` on both platforms (iOS reads it through `ios/Config.xcconfig`; Android's `applicationId` through Gradle), the display name from `APP_NAME`, and the URL scheme from `APP_LINK_PREFIX`, so none of them is a committed project-file change. Generated native artwork and linked fonts are produced by the pipeline, not committed:

```bash
yarn generate:app-icon        # from brand/app-icon.png
yarn generate:launch-screen   # from brand/splash-screen.png, on boot.background
npx react-native-asset        # links brand/fonts
```

Signing (team, certificates, provisioning, keystores) and store listings belong to the client's pipeline and secrets.

## Supported API for client code

Client code may depend on:

- `src/v3/extensions` — `defineNavigatorExtensions`, the screen and component types, ids, params and props
- `src/v3/branding` — `defineBranding`, `useBranding`, `getBuildBranding`
- `src/v3/ui` — the component library (the barrel, `src/v3/ui/index.ts`)
- `src/v3/theme` — tokens (`space`, `radius`, `type`, …) and `describeStatus`
- `src/v3/i18n` — `useTranslation`
- `src/v3/data`, `src/v3/realtime`, `src/v3/shell`, `src/v3/settings` — the data, realtime, duty/sync and settings hooks
- `src/v3/navigation` — `useDriverId`, `useDriverUserId`, `useFeatures`, `useOrganization`, `useSignOut`

Breaking changes to these, to screen and component ids, params and props, and to the branding schema are called out in the release notes. Anything else under `src/` may change between releases.

## Upgrading

```bash
git fetch upstream --tags
git merge v3.1.0              # a release tag
yarn install
cd ios && bundle exec pod install && cd ..
yarn typecheck                # brand/** is checked against the new release's types
yarn test                     # includes the bundled brand and extensions guards
```

`yarn typecheck` fails on a renamed screen id, a changed param or prop, or a branding field that no longer exists — before anything runs. `yarn test` fails if the brand file produces any validation or contrast issue (`src/v3/branding/__tests__/bundled-brand.test.ts`).
