# iOS release preparation and manual checklist

This document is the source of truth for preparing an iOS release. It is a
checklist, not an automated submission workflow. Building or uploading a binary
does not authorize release, and the final App Store Connect submission must be
performed manually by an approved release owner.

## Committed application identity and versioning

| Purpose                             | Display name           | Bundle ID                       | EAS profile / channel |
| ----------------------------------- | ---------------------- | ------------------------------- | --------------------- |
| Preview and internal device testing | `Tone Yar Thi Preview` | `com.toneyarthi.mobile.preview` | `preview`             |
| App Store                           | `Tone Yar Thi`         | `com.toneyarthi.mobile`         | `production`          |

The marketing version is committed as `expo.version` in `app.config.js` and is
the user-visible App Store version. Increment it deliberately for each release.
EAS uses remote app-version state and `autoIncrement` for preview and production,
so every hosted build receives a monotonically increasing iOS build number. Do
not manually reuse or decrement the remote build number. The committed
`ios.buildNumber` is a local/native-generation fallback; verify the resolved
remote value before upload. Runtime versions follow the marketing version, and
preview and production use separate EAS Update channels.

The app icon is an opaque 1024 px square. The adaptive icon and light/dark splash
art use the same mark and safe padding. PNG files are deterministic build
artifacts and are intentionally ignored by Git because the code-review system
does not accept binary files. Run `pnpm --filter @toneyarthi/mobile
assets:generate` to create them; local Expo start commands and EAS builds run the
same generator automatically, and resolving `app.config.js` also guarantees the
files exist before Expo inspects them. Commit changes to the generator, never its
PNG output. Rebuild the native application after any icon, splash, entitlement,
plugin, or `Info.plist` change; these cannot be added by an over-the-air update.

## Apple Developer portal records

Record the following non-secret values in the release ticket (do not put private
keys or certificate exports in Git):

- Apple Developer **Team ID** and legal account holder.
- Explicit App IDs for `com.toneyarthi.mobile` and
  `com.toneyarthi.mobile.preview`, with Push Notifications enabled on each.
- EAS project owner/project ID after `eas init`; commit the generated
  `extra.eas.projectId` only after it belongs to the correct organization.
- App Store Connect numeric **Apple ID** for the production app; add it as
  `submit.production.ios.ascAppId` in `eas.json` before any upload command is
  run, or pass the record explicitly during the approved manual submit flow.
- The App Store Connect API issuer ID/key ID and which restricted API key is held
  by the release system. Keep the `.p8` file only in the approved secret store.

Use distinct EAS remote credential sets because the preview and production App
IDs differ. For each, verify the Apple distribution certificate owner, serial,
expiration, and provisioning-profile UUID/expiration with `eas credentials`.
The profile must match the exact App ID and include `aps-environment`; never
share or commit a `.p12`, password, mobileprovision, or private key. Preview is
internal distribution and must never be uploaded as the production record.

## APNs and notification capability

The Expo notifications plugin and the committed `aps-environment` entitlement
declare remote-notification capability. Development clients use the APNs sandbox;
EAS preview and production distribution builds use production APNs. Create an
APNs authentication key in the correct Apple team (prefer one restricted to the
required topics where available), record its key ID/team ID, upload it to the
matching EAS credential set, then remove local copies. Rotate deliberately and
test again after rotation.

Keep tokens partitioned by `EXPO_PUBLIC_APP_ENVIRONMENT`; a preview token must
never enter a production send. Test opt-in, denial, token rotation, receipt
handling, notification tap routing, and revocation on a physical device. The
system notification alert is controlled by iOS and has no customizable
`Info.plist` usage-description key. Permission remains user-initiated in Settings.

## Usage descriptions, background modes, and export compliance

The current app plays audio and receives notifications; it does **not** record
audio, access photos/camera, request location, read contacts/calendars, or track
users. Therefore no protected-resource `NS…UsageDescription` keys are currently
required. `expo-audio` explicitly disables microphone permission. Do not add a
vague or unused usage string: if a future native dependency accesses a protected
API, add a specific, user-facing description before release and test the prompt
on device.

`UIBackgroundModes = audio` is intentionally the only background mode. The app
must start playback from an explicit user action, show accurate Now Playing
metadata, respond to system controls, and stop consuming background resources
when playback stops. It must not start silent audio, autoplay after launch,
resume unexpectedly, or use audio as a general-purpose background-execution
mechanism. These behaviors are review-sensitive; include the exact test path in
App Review notes and remove the mode if background listening is removed.

The app declares that it does not use non-exempt encryption. Re-evaluate export
compliance before release if custom cryptography, VPN behavior, or encryption
beyond operating-system HTTPS facilities is introduced.

## App Store Connect and privacy work still required

Create the production App Store Connect record manually with the exact bundle
ID and primary language. Complete every item below before TestFlight review:

- App name availability, subtitle, promotional text, full description,
  keywords, category, age-rating questionnaire, support URL, marketing URL (if
  used), copyright, and review contact information.
- A stable privacy-policy URL and account-deletion instructions if accounts are
  introduced. Confirm all links from a release build.
- App Privacy answers for data actually collected by the API and SDKs. Audit at
  least push tokens/installation IDs, diagnostics, analytics, saved preferences,
  and any linked identifiers; state collection purpose, linkage, and tracking
  accurately. Current code does not justify declaring cross-app tracking.
- Required-reason API declarations and third-party SDK privacy manifests from
  the archived binary. Review Xcode's privacy report; do not copy disclosures
  from this checklist without verifying the shipped build and backend retention.
- Content rights, news/content licensing, moderation/contact process, encryption
  export answers, and advertising declarations as applicable.
- Screenshots for every device class App Store Connect requires for the chosen
  iPhone/iPad support, captured from the production UI with approved Burmese and
  English content. Do not use preview branding, placeholder data, status-bar
  anomalies, or unlicensed imagery. Add App Preview video only if approved.
- Version-specific release notes, review notes, demo credentials/instructions if
  gated content exists, and a contact who can answer during review. Explain how
  to start an article and lock the phone to verify background audio; explain that
  notifications are optional and enabled from Settings.

Because `supportsTablet` is enabled, validate the complete experience on iPad
and supply its required screenshots. If that support cannot meet release quality,
make an explicit product decision and native rebuild rather than submitting an
untested tablet layout.

## Build, TestFlight, and manual release procedure

1. Confirm the production API/site endpoints, clean Git state, approved commit,
   marketing version, release notes, dependency/privacy audit, and resolved Expo
   config. Never put secrets in `env`; `EXPO_PUBLIC_*` values are embedded in the
   client. Store secret credentials in separate EAS `preview` and `production`
   environments and restrict access to release owners.
2. Run repository checks and a production configuration inspection. Confirm the
   name, bundle ID, version/build, icon/splash paths, `audio` background mode,
   and APNs entitlement in the resolved output and generated archive.
3. Build preview with `eas build --platform ios --profile preview`. Install it on
   registered devices and complete functional, notification, accessibility,
   offline, background-audio, interruption, and privacy-prompt testing.
4. After approval, build with
   `eas build --platform ios --profile production`. Inspect the build details,
   signing identity, provisioning profile, entitlements, version/build, and
   archive privacy manifest. This command does not submit.
5. When the release owner explicitly approves upload, configure the `ascAppId`
   and run `eas submit --platform ios --profile production --id
<approved-build-id>` manually (or upload the inspected archive with Apple's
   Transporter). Never use `--latest` without recording and verifying its ID.
6. In App Store Connect, wait for processing and export/privacy warnings, attach
   the build to an internal TestFlight group, add tester notes, and run the full
   physical-device acceptance matrix. Then add external groups and submit the
   beta for TestFlight review only if external testing is approved.
7. Triage crashes and tester feedback, issue a new build number for fixes, and
   repeat acceptance. Select the exact accepted build for the App Store version,
   complete metadata/privacy answers, and choose **manual release** (not automatic
   or phased release unless separately approved).
8. An authorized release owner reviews all answers and presses **Submit for
   Review** in App Store Connect. After approval, that owner separately chooses
   when to release. Record build ID, App Store version, approval, and release
   time; monitor crashes, playback, notifications, and backend health.

Do not add CI steps that call `eas submit`, App Store Connect submission APIs, or
automatic release. Upload, review submission, and store release are three
separate manual approvals.
