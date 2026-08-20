# Font licenses

Archivo and JetBrains Mono are both SIL Open Font License 1.1.

These live outside `assets/fonts/` deliberately: `react-native.config.js` links
everything in that directory into the app bundle, and shipping licence text
inside the IPA/APK is waste. Attribution belongs on the in-app legal screen
(see `docs/redesign/03-DESIGN-GAP-SPEC.md` → H3).
