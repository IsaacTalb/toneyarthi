# Android / Google Play release runbook

This is a manual production-release checklist. EAS may create and sign an
Android App Bundle (AAB), but this repository must never publish or promote a
release automatically. A release owner must inspect and approve every upload
and Play Console promotion.

## Committed Expo identity and native configuration

| Purpose                          | Display name           | Application ID                  | EAS profile / channel      |
| -------------------------------- | ---------------------- | ------------------------------- | -------------------------- |
| Development and internal preview | `Tone Yar Thi Preview` | `com.toneyarthi.mobile.preview` | `development` or `preview` |
| Google Play production           | `Tone Yar Thi`         | `com.toneyarthi.mobile`         | `production`               |

`expo.version` is the user-visible version name. Increase it deliberately for a
release. Android `versionCode` starts from the committed fallback, while EAS
remote app-version state and production `autoIncrement` assign a unique,
monotonically increasing code to hosted builds. Never reset the remote counter
or reuse a code already uploaded to Play. Inspect the resolved config and EAS
build record before upload.

The Expo configuration supplies the 1024 px legacy icon, transparent adaptive
foreground with an opaque background color, and light/dark splash artwork.
Assets are deterministically generated and ignored by Git; run
`pnpm --filter @toneyarthi/mobile assets:generate` before local native tooling.
A native rebuild is required after identity, icon, splash, plugin, permission,
or service changes.

Android 13+ notification permission is declared in native configuration and is
requested only after a user opts in. The app creates the `news` channel at
default importance before registration; keep server payloads on that channel.
The audio player requires foreground-service, media-playback foreground-service,
and wake-lock permissions. Expo Audio owns the media session and playback
service. After every Expo SDK upgrade, inspect the merged manifest and verify
the service has the `mediaPlayback` foreground-service type. Do not implement a
second service, silent playback, or unrelated background work.

## One-time Google Play Console creation

1. In the organization Play Console account, create the app manually with the
   exact name `Tone Yar Thi`, default language, **App**, and the correct free or
   paid status. The price choice cannot later be changed from free to paid.
2. Accept the declarations and create the package using the exact production
   application ID `com.toneyarthi.mobile`. Do not upload a preview build to this
   record.
3. Enable **Play App Signing**. Treat Google's app-signing key as the long-lived
   identity; the EAS-managed key is the upload key. Record certificate SHA-1 and
   SHA-256 fingerprints and Play/EAS account owners in the release system, not
   private key material in Git.
4. Configure account access so only approved release owners can create releases
   or promote tracks. If API upload is later approved, create a least-privilege
   Google service account, invite it in Play Console, and store its JSON key as
   an EAS secret/file or in the release secret manager. Do not commit it or put
   its contents in an `EXPO_PUBLIC_*` variable.

## EAS signing and Firebase architecture

Run `eas init` once under the correct Expo organization and commit only the
non-secret `extra.eas.projectId` that it adds. The production profile uses
EAS-hosted remote credentials and emits an AAB. From a release-owner workstation:

1. Run `eas credentials --platform android --profile production` and let EAS
   create an upload keystore, or upload an organization-controlled existing
   upload key. Do not download it unless recovery policy requires an encrypted,
   audited backup. Never commit a keystore, alias password, or credentials JSON.
2. Record key fingerprints and verify they match Play Console's **upload key**,
   not merely the app-signing key. Restrict EAS project and credential access.
   Test the documented Play upload-key reset process before it is an emergency.
3. Use separate Firebase projects (recommended) for preview and production.
   Register Android apps for the exact application IDs and add the Play
   app-signing SHA fingerprints where Firebase products require them.
4. Download each Firebase `google-services.json` into an EAS **file** environment
   variable named `GOOGLE_SERVICES_JSON` in the matching `preview` or
   `production` environment. Expo config consumes the temporary file path only
   when the variable exists. Keep the files out of Git. Configure the matching
   FCM V1 service account with EAS credentials, then verify delivery on a
   physical, store-signed device. Firebase is required for Android push; do not
   add Analytics or other Firebase products unless their collection and consent
   behavior have been reviewed.

## Store listing, policy, and release declarations

Complete and have a release owner verify all answers against the exact shipped
binary and production backend:

- Main store listing: short/full descriptions, app category and tags, support
  email, website and stable privacy-policy URL. Provide localized text only
  after editorial review.
- Assets: high-resolution icon, feature graphic, and current phone screenshots;
  add tablet/ChromeOS screenshots only for supported, tested form factors. Use
  production branding, licensed imagery, representative content, clean status
  bars, and no preview endpoints or test data.
- App access instructions and durable review credentials if any content is
  gated; ads declaration; target-audience/age questionnaire; content rating;
  news/content-rights declarations; and account-deletion URL if accounts exist.
- **Data safety**: audit the app, API, Expo/React Native SDKs, and vendors. At
  minimum assess push tokens/installation identifiers, diagnostics/crashes,
  analytics events, preferences/bookmarks/download metadata, network logs, and
  any account identifiers. Declare collection, sharing, purpose, optionality,
  encryption in transit, retention/deletion, linkage, and tracking accurately.
  Do not infer an answer from this checklist or claim that no data is collected.
- Notification use and the foreground-service media-playback declaration. The
  service is user-initiated audible article playback with visible media controls;
  provide Play's requested demo video/instructions if the form asks for them.
- Current target API, restricted permissions, SDK declarations, and any other
  Play policy forms shown for the app. Re-check them for every material SDK or
  product change.

## Build, internal test, and production promotion

1. Confirm an approved clean commit, production endpoints, marketing version,
   release notes, policy audit, EAS project/owner, remote version state, and
   signing/Firebase fingerprints. Remember that `EXPO_PUBLIC_*` values are
   embedded and are not secrets.
2. Generate assets and inspect production config:
   `EAS_BUILD_PROFILE=production pnpm --filter @toneyarthi/mobile exec expo config --type public`.
   Confirm display name, package, version, version code, icon/adaptive icon,
   splash, notification permission/plugin, and audio permissions. Inspect the
   merged manifest from the resulting native build as well.
3. Build `preview` and complete functional, accessibility, offline, notification,
   background-audio, interruption, upgrade, and data-deletion tests on physical
   devices. Preview uses a separate application ID and cannot prove Play signing.
4. Run `eas build --platform android --profile production`. This produces a
   signed AAB and **does not submit it**. Record the exact EAS build ID, version
   code, commit, upload certificate, checksums, and test evidence. Download and
   inspect the artifact through the approved release workflow.
5. Create an **Internal testing** release in Play Console and manually upload
   that exact AAB. Alternatively, only after explicit approval, run
   `eas submit --platform android --profile production --id <approved-build-id>`;
   the committed submit profile targets Internal and creates a draft. Never use
   `--latest`, automatic submission, or a production track from CI.
6. Resolve Play processing/policy warnings, add release notes and testers, then
   roll out the internal release. Install from the Play opt-in link so Play App
   Signing, FCM, Android 13 permission, notification channel, media service,
   updates, deep links, billing status, and production APIs are tested as users
   receive them. Record devices/OS versions and acceptance results.
7. Fix issues with a new version code and repeat. After sign-off, promote the
   exact accepted artifact through closed/open testing if required. An approved
   release owner reviews the Data safety and policy forms again and manually
   promotes to Production, preferably with a monitored staged rollout. Do not
   create a new untested artifact during promotion.
8. Monitor Android vitals, crashes/ANRs, playback, push receipts, reviews, and
   backend health. Pause or halt a staged rollout when thresholds are exceeded;
   rollback normally requires shipping a new, higher-version-code bundle.

Uploading, rolling out an internal test, and promoting to production are three
separate approvals. No command in this repository performs them automatically.
