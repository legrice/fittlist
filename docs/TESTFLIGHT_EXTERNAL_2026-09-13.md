# External TestFlight readiness — September 13, 2026

## Result

The app checks completed successfully. Apple-side readiness is **not yet verified**: App Store Connect is at its sign-in screen. No beta review was submitted and no testers were invited.

Latest uploaded archive: **FittList 1.0 (8)**, uploaded September 11. It includes the smaller, flat bright-green mark on the dark app-icon background. Native source has not changed since that build; recent web changes are served from the production site. Latest web revision checked: `7291bd4b` (banner image picker), with a successful Vercel deployment. A new binary is not needed for those web changes alone.

## Completed checks

- Production iOS release gate passed, including rejected unsafe configurations and deep-link validation.
- Current Release simulator build succeeded and launched the production site on iOS 26.5.
- Native login and signup sheets visually checked: safe-area layout, dismissal, email-to-password keyboard navigation, and the keyboard’s Passwords option. No production credentials or signup were submitted.
- Full isolated iPhone WebKit audit: **86 passed, 0 failed**, covering three screen sizes and authenticated routes, session handling, navigation, recovery, sharing and accessibility assertions.
- Dedicated WebKit Back-navigation checks passed: You → Edit profile → You, studio/admin/calendar navigation, refresh, month changes, browser Forward, and cold-entry fallbacks.
- Banner checks passed for studio, group and person profiles. A 15,290,882-byte photo was compressed, saved, reloaded and removed; the largest request was 662,499 bytes. Empty pickers expose Add image and omit Remove image and Save banner.
- Live support, privacy and terms pages returned HTTP 200.
- Apple’s cached site association returned HTTP 200 and identified `58MG79EU7S.co.fittlist.app` for universal links and password credentials.
- Build 8 archive identifies version 1.0, build 8, iPhone family, minimum iOS 16 and no non-exempt encryption.

The first browser runs included intermittent navigation failures. The stalled-navigation test asserted the old URL before WebKit completed Back; it now waits for the destination URL. A subsequent complete run passed all 86 checks. Banner tests were also updated for the new Add image interface. These are test/documentation changes, not a new app feature release.

## Before submitting to external beta review

- [ ] Sign in to App Store Connect and confirm build 1.0 (8) is processed, selectable for external testing, and has no outstanding compliance or processing issues.
- [ ] Confirm the beta description, feedback email and beta review contact details are complete.
- [ ] Provide a working, dedicated reviewer account and sign-in instructions if requested. Reviewers must be able to reach authenticated features without needing access to the owner’s email inbox. Keep credentials out of this repository.
- [ ] Check any outstanding agreements or required declarations shown by Apple against the actual app configuration.
- [ ] Select/create the intended external tester group, add the build and supply What to Test. Confirm the build was not restricted to internal-only distribution.
- [ ] Submit for TestFlight App Review when the remaining checks are satisfied. Invite testers or enable a public link after approval.

Apple documents the required beta information in [Provide test information](https://developer.apple.com/help/app-store-connect/test-a-beta-version/provide-test-information) and the group/build/review sequence in [Invite external testers](https://developer.apple.com/help/app-store-connect/test-a-beta-version/invite-external-testers).

## Physical iPhone pass still needed

The paired iPhone was unavailable during this audit. Simulator and browser coverage do not establish these device/account-dependent results:

- [ ] Install build 8 from TestFlight; confirm the icon, first launch and relaunch.
- [ ] Complete signup/email confirmation and password login with a test account; test saved-password autofill and passkeys on the phone.
- [ ] Follow a calendar, save a class and confirm it appears in Your calendar. Test Back from Edit profile to You.
- [ ] Choose a real photo, save a banner and use the native share sheet; verify cancellation and permission-denial recovery.
- [ ] Open a shared class/login link from outside the app and confirm the correct destination after sign-in.
- [ ] Try offline/reconnect, background/resume, larger text and VoiceOver.
- [ ] If included in the beta scope, connect/disconnect Google Calendar and test event signup/check-in with isolated test data.

Native push notifications are not part of this build; notifications are in-app. Do not describe native push as a beta feature.

## Suggested beta description

FittList helps you find fitness classes, follow coaches and studios, and keep your weekly plans together. Explore schedules, save classes to your calendar, and share your lineup with friends.

## Suggested What to Test

Please try signing in, finding and following a calendar, saving a class, editing your profile and banner, and sharing a class or weekly lineup. Check that Back takes you where you expect. Let us know about slow loading, stuck screens, confusing controls or layout issues, and include your iPhone model and iOS version with your feedback.

## Evidence on the audit machine

- `/tmp/ios-external-browser-settled.log` — final 86/0 WebKit run
- `/tmp/ios-external-back.log` — navigation checks
- `/tmp/ios-banner-picker-webkit.log` — all three banner profiles
- `/tmp/fittlist-external-sim.log` — Release simulator build
- `AppStore/Builds/FittList-1.0-8.xcarchive` — previously uploaded archive (not committed)

Temporary logs may be removed by macOS; the results above are the durable audit record.
