# Mobile accessibility audit

## Scope and findings

The React Native application was audited for accessible names, roles and states,
focus order, heading navigation, 44-point touch targets, text/background contrast,
dynamic type, Burmese shaping, seeking, playback announcements, and reduced motion.

- Story cards are one concise **button** named by the headline. Category, audio
  availability, and the action are provided once as a hint; decorative artwork
  and icons are excluded from the accessibility tree.
- The mini player is no longer a button containing another button. Its reading
  order is open-player action, then play/pause. All icon controls have a
  minimum 44 by 44 point target.
- Filter and playback-rate choices expose radio roles with selected states.
  Screen and section titles expose header roles.
- The seek control exposes an adjustable role, current/total time and 15-second
  increment/decrement actions. Visible timestamps are hidden from screen readers
  because the adjustable already provides that value.
- Playback changes announce selection, playing, pausing, buffering, completion,
  and errors. Position ticks deliberately do not announce.
- Text uses the platform system font, permits uncapped font scaling, and uses
  expanded Burmese line heights. Android `sans-serif` and iOS `System` provide
  Burmese Unicode shaping; content must remain NFC Unicode rather than legacy
  Zawgyi text.
- Skeleton and mini-player animation honor the OS Reduce Motion setting. Critical
  information never depends on animation.

The light palette was checked as opaque sRGB pairs. Body text (`#18251D`) and
muted text (`#58655D`) on the canvas/surface, brand text (`#315C3D`) on white or
brand-soft, danger text (`#A33A32`) on danger-soft, and white on brand meet WCAG
AA for their intended text sizes. Borders and disabled decoration are not used as
the sole carrier of state.

## Device and assistive-technology matrix

No physical Android or iOS device, emulator, TalkBack, or VoiceOver service is
available in the repository's non-interactive CI container. Consequently, no
device/OS combination is claimed as manually tested in this change. Before
release, complete and record this matrix with the production build:

| Platform | Required combination                            | Text size         | Critical flow                                                                |
| -------- | ----------------------------------------------- | ----------------- | ---------------------------------------------------------------------------- |
| Android  | Pixel-class phone, Android 15+, latest TalkBack | 200%              | Home card → article; Listen item → player; seek; pause/resume; tab traversal |
| iOS      | iPhone, iOS 18+, VoiceOver                      | Accessibility XXL | Same flows; rotor headings; adjustable swipe; dismiss player                 |

Verify at each stop that focus remains visible and logical, cards announce only
one action, Burmese clusters do not clip or split, control labels/state changes
are spoken once, and landscape/reflow does not overlap at the largest text size.
Also repeat with Reduce Motion enabled and with Bold Text/Increase Contrast.

## Library limitations

- `expo-audio` supplies playback state but no screen-reader announcement policy;
  announcements are generated in the app. Buffering callbacks can change rapidly,
  so only phase transitions are spoken and elapsed-time ticks are suppressed.
- The custom seek track is not a native platform slider. TalkBack and VoiceOver
  adjustment uses 15-second accessibility actions; direct touch seeking remains
  available to sighted users. Revalidate these actions after React Native or Expo
  upgrades.
- `expo-router`/React Navigation owns native screen transitions and initial focus.
  It does not provide a cross-platform API to place focus on a particular heading,
  so the app preserves source order and native route announcements rather than
  forcing focus. Modal/player dismissal returns focus according to the native
  navigation stack.
