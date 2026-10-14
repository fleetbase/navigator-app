> v2.0.11 ~ "Reliable Android order updates and Google Play policy compliance"

---

## Highlights

This release fixes an Android crash when updating an order activity and prepares Navigator for Google Play's current location, media-access, and Android 16 requirements.

---

## Bug Fixes

- Order, destination, and loading controls now use an Android-safe activity indicator, preventing the Fabric progress-bar measurement crash during activity updates.
- Gallery attachments now use Android's system photo picker instead of requesting broad photo and video access.
- Android release signing reads the established Navigator signing configuration and reports incomplete configuration clearly.

---

## Privacy and Platform Compliance

- The location screen now explains precise background-location collection, its operational purpose, authorized dispatcher visibility, and secure transmission before requesting Android permission.
- Location permission is mandatory before sign-in, with direct retry, settings, and privacy-policy actions when permission is denied.
- Background tracking and location uploads only run for an authenticated, online driver with permission, and stop after logout, offline mode, or permission revocation.
- Android now targets API level 36.

---

## CI and Release Process

- Pull requests and release branches run behavior tests plus Android and iOS debug builds.
- Dependency review complements the repository's existing CodeQL scanning on pull requests.
- Merging a `dev-v*` release branch now validates and creates the matching release tag through Fleetbase's reusable release workflow.
- The broken Play Store and App Store publishing jobs are disabled; store artifacts remain a controlled manual release step.

---

## Need help?

- [GitHub Discussions](https://github.com/fleetbase/fleetbase/discussions)
- [Discord](https://discord.gg/HnTqQ6zAVn)
