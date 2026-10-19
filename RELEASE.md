> v2.0.12 ~ "Signing secrets out of the app binary and Facebook login removed"

---

## Highlights

This release stops Android release-signing secrets from being compiled into the app and removes Facebook login together with the Meta SDK.

---

## Security

- Android release signing now reads `ANDROID_NAVIGATOR_APP_UPLOAD_STORE_FILE`, `_STORE_PASSWORD`, `_KEY_ALIAS` and `_KEY_PASSWORD` from `android/local.properties` (gitignored) or environment variables. Values in `.env` are still read so existing setups keep building, but they should be moved out: `react-native-config` compiles every `.env` key into `BuildConfig` and string resources, so upload-keystore passwords kept there ship readable in the APK/AAB.
- If your signing passwords were ever in `.env`, rotate the upload key password. Every release built that way contains them.

---

## Removed

- Facebook login is gone. `react-native-fbsdk-next` and the Facebook iOS/Android SDKs are no longer dependencies, and the Facebook SDK setup is removed from `AppDelegate.swift`, `Info.plist`, `AndroidManifest.xml` and the Android string resources.
- Client apps can drop the `FACEBOOK_APP_ID` and `FACEBOOK_CLIENT_TOKEN` keys from their `.env` and CI secrets. Apple, Google and phone login are unchanged.

---

## Upgrading client apps

- Move the four `ANDROID_NAVIGATOR_APP_UPLOAD_*` values from `.env` into `android/local.properties` or your CI secret store (see the README's "Android Release Signing" section).
- Run `yarn install` and `npx pod-install` after pulling so the Facebook pods are removed from `ios/Podfile.lock`.

---

## Need help?

- [GitHub Discussions](https://github.com/fleetbase/fleetbase/discussions)
- [Discord](https://discord.gg/HnTqQ6zAVn)
