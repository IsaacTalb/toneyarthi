# Push notification setup and operating policy

The app registers Expo push tokens, but this repository intentionally does not
contain a broadcast job or automatic breaking-news sender. Delivery should be
added only with editorial approval, rate limits, receipts, and environment
isolation. New installations subscribe to no breaking news, briefings, or
categories.

## Provider and build configuration

1. Create separate Firebase projects (or at least credentials) for non-production
   and production. In Firebase, enable Cloud Messaging, download
   `google-services.json`, keep it out of source control, and reference it with
   `android.googleServicesFile` in environment-specific Expo config.
2. In Apple Developer, enable **Push Notifications** for the exact production
   bundle identifier. Create an APNs key (preferred) or certificate and upload it
   with `eas credentials`; never put the `.p8` file or key ID secrets in Git.
3. Run `eas init` so the Expo config receives the real EAS `projectId`. Set
   `EXPO_PUBLIC_APP_ENVIRONMENT` to `development`, `preview`, or `production` in
   the matching EAS profile. Tokens from these environments must never be mixed
   by a future sender.
4. Configure Android FCM V1 and iOS APNs credentials in EAS for each application.
   Build a development client or internal/production binary after changing the
   notifications plugin; Expo Go is not a production push test environment.

## Device and console requirements

- Test acquisition, rotation, tap handling, permission denial, reinstall, and
  revocation on physical iOS and Android devices. Simulators/emulators are not an
  acceptance test for provider delivery.
- In App Store Connect, ensure the app identifier has push entitlement and the
  submitted provisioning profile includes it. Explain notification use in review
  notes and do not gate unrelated content on consent.
- In Google Play Console, keep the application ID aligned with Firebase/EAS,
  complete the Data safety disclosure for device identifiers, and verify the
  Android 13 notification permission on a store-signed internal-test build.
- The permission prompt is user initiated from Settings. The app creates a
  default-importance Android `news` channel before token registration.

## Backend and payload contract

`POST /v1/push-tokens` accepts an installation ID, Expo token, native platform,
app environment, and explicit preferences. The API validates active category
slugs and upserts by installation so token rotation does not leave an active old
address. `DELETE /v1/push-tokens` requires both the installation ID and current
token, making retries idempotent and preventing a stale client from revoking a
new token. API responses and application logs must never contain a full token;
if operational correlation is required, log only a one-way digest or final four
characters.

Notification payloads that open content may contain `data.articleSlug` using the
canonical lowercase article slug. The app validates it before routing to
`/article/[slug]`; arbitrary URLs in notification data are ignored.

Before implementing sending, enforce preference filters, environment matching,
editorial authorization, per-device/global caps, quiet hours, Expo receipt
processing, and revocation of `DeviceNotRegistered` tokens. Start with a small
internal audience rather than an aggressive default campaign.
