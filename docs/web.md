# Web build

The v3 app also runs in a browser, from the same screens, theme and data layer as the native apps. It is a phone-shaped app: below 480px wide it fills the screen, and on a wider screen it stays a centred 480px column.

```bash
yarn web         # dev server on http://localhost:8080 (WEB_PORT to change it)
yarn web:build   # production build in dist/
```

CI runs `yarn web:build` on every pull request. Serve `dist/` from any static host that falls back to `index.html`, because the app's routes are real URLs (`/Orders/OrderDetail?orderId=…`). The browser's back button, a reload and a shared link all work. Use HTTPS: browsers only allow location and camera on a secure origin (`localhost` is exempt).

## Setting up a deployment

- **CORS:** the Fleetbase API must allow the site's origin, or every request fails in the browser.
- **Secrets:** `webpack.config.js` has an allowlist (`PUBLIC_ENV`), and nothing else from `.env` reaches the bundle. `FLEETBASE_KEY` is never on it, because anyone can read a browser bundle. If your instance needs a key before sign-in, set `FLEETBASE_WEB_KEY` to one that is safe to publish; a driver's own token replaces it at sign-in.
- **Map tiles:** the default is OpenStreetMap's public tile server, whose usage policy does not cover production traffic. Set `MAP_TILES_LIGHT` (and optionally `MAP_TILES_DARK`) to a provider you have terms with. Without a dark style, the light tiles are inverted.

`ENVFILE` picks another env file: `ENVFILE=.env.prod yarn web:build`. A client's `brand/` folder applies as it does on native, including `brand/fonts`.

## How native packages are replaced

App code imports the same module names on every platform. `resolve.alias` in `webpack.config.js` points packages with no browser build at the implementations in `web/`, and platform files (`*.web.tsx`) replace the two camera components:

| Package | On the web |
|---|---|
| `react-native-maps` | Leaflet, with markers rendered as real React children |
| `@gorhom/bottom-sheet` | A sheet with the same API, snap points and drag to dismiss |
| `react-native-signature-canvas` | An HTML canvas |
| `CameraCapture`, `QrCodeScanner` (`react-native-vision-camera`) | `getUserMedia`, with ZXing decoding QR and Code 128 |
| `react-native-background-geolocation` | `navigator.geolocation`, posting fixes to the same tracking URL |
| `react-native-permissions` | The Permissions API; a browser's "denied" is `blocked` |
| `react-native-notifications` | The Notification API |
| `react-native-background-fetch` | Reports itself as unavailable |
| `react-native-device-info`, `react-native-i18n`, `react-native-config` | The browser's own values and the public config |

Reanimated, Gesture Handler, Screens, SVG, MMKV (on `localStorage`), Localize and BootSplash use their own web builds.

`web/babel-plugin-rn-props.js` turns the React Native props that do nothing in a browser into working ones: `accessibilityState` and `accessibilityValue` into ARIA attributes, and `start`/`end` into logical CSS offsets. `web/fonts.ts` registers the theme's fonts with `@font-face`.

## What a browser can't do

- **Tracking stops when the tab closes or is suspended.** Location is only sent while the page is running, so the native apps remain the way to track a driver through a shift.
- **No remote push.** There is no device token for the push service, and the socket keeps the app live only while it is open. Local notifications work once permission is granted.
- **Scanning needs a camera and permission.** There is no manual entry on the proof screen yet, so a driver who can't use the camera can't complete a scan step. Photos can also be chosen from the device.
- **Native navigation apps may not open.** Hand-off falls back to the web version of the map.
- **"Open settings" can't open the browser's settings.** A blocked permission has to be changed from the site controls in the address bar.

## Adding a dependency

A package that needs native code breaks this build, and CI will say so. Add an implementation to `web/`, alias it in `webpack.config.js`, and add it to the table above. Packages published as untranspiled source must also match `SOURCE_PACKAGES` in the config.
