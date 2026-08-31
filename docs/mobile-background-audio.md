# Mobile background audio and remote controls

The mobile app uses `expo-audio` as its only playback stack. Do not add a second native player: the player activated by `setActiveForLockScreen` is the same player observed by the in-app controls.

## Runtime behavior

- Loading publishes the title, artist, and artwork to iOS Now Playing and the Android media notification. Play, pause, and timeline seek commands are handled where the OS exposes them.
- Android's active media session supplies its foreground media-playback service; iOS uses the `audio` background mode. Playback uses the media category, works with the mute switch, and does not mix with another primary source.
- Calls, Siri/Assistant, alarms, audio-focus loss, and route removal are owned by the native audio session. Its resulting status update is the UI source of truth. The app does not blindly resume after a call. Bluetooth and wired-headset commands use the same media session.
- Backgrounding does not pause playback. Item, rate, and position are persisted when the app becomes inactive and periodically while playing. A cold launch reloads and seeks but intentionally stays paused.
- Next/previous controls are not advertised because the player owns one article, not a queue. Seeking is clamped to media bounds.

## Apple configuration

1. Register `com.toneyarthi.mobile` in the Apple Developer portal and create its App Store Connect app.
2. Let EAS create the distribution certificate and provisioning profile, or upload matching credentials with `eas credentials`.
3. Keep `UIBackgroundModes = ["audio"]` in `app.json`. Make a new native build after changing this or a plugin; an OTA update cannot change `Info.plist`.
4. No microphone permission is needed. Explain background playback accurately in App Review notes.

## Google configuration

1. Create the Play Console app with package `com.toneyarthi.mobile`, enable Play App Signing, and grant an EAS submit service account access if used.
2. Keep `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MEDIA_PLAYBACK`, and `WAKE_LOCK` in the manifest. Android 14+ also needs the foreground-service type supplied by Expo Audio's media session. Inspect the generated manifest after Expo SDK upgrades.
3. Declare the foreground service's media-playback use in Play Console App content. An active media session owns its ongoing media notification.

## EAS and development builds

```sh
pnpm install
pnpm exec eas login
pnpm exec eas build --profile development --platform ios
pnpm exec eas build --profile development --platform android
pnpm exec expo start --dev-client
```

Use `preview` for internal release-like testing and `production` for stores. Run `eas init` before the first hosted build and commit its generated EAS project ID.

Expo Go is not an acceptance environment: its fixed native manifest cannot validate this app's iOS background mode, Android permissions/service, signed capabilities, or production lifecycle. Simulators cannot faithfully exercise calls, hardware buttons, Bluetooth routes, or OS process reclamation. Rebuild the development client whenever native configuration or a native dependency changes.

## Physical-device acceptance checklist

Run the full matrix on a supported physical iPhone and Android phone. Record OS version, device, build ID, and results in the release ticket; CI cannot certify hardware behavior.

1. Start an article, lock the device, and verify uninterrupted playback plus correct title, artist, artwork, elapsed time, and duration.
2. From iOS lock screen and Android media notification, play, pause, and seek; confirm the in-app UI agrees after foregrounding.
3. Exercise wired and Bluetooth play/pause. Disconnect/reconnect the active route and confirm audio never unexpectedly moves to the speaker; test seek if exposed.
4. Receive/end a real call. Also test Siri/Assistant, an alarm, and a second media app. Verify focus is ceded and playback resumes only per OS policy.
5. Background for ten minutes, switch apps, and lock/unlock. On Android remove the task during playback and verify the service on the tested OS.
6. Pause at a known point, terminate, relaunch, and verify item/rate/position restore without autoplay. Repeat after reboot.
7. Test unavailable media and network loss. The notification must not claim playback and the app must report failure without crashing.

Acceptance is blocked until every applicable row passes on both physical platforms. Document OS-specific exceptions with device logs and release-owner sign-off.
