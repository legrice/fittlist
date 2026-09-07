# iPhone TestFlight readiness audit — 2026-09-07

## Recommendation: NOT READY for external distribution

The source has been hardened and an unsigned Release iPhone archive builds. Distribution is still gated by signing, production deployment/Apple association, and completion of physical-device tests. Nothing was uploaded, distributed or merged into main.

## Changes

- iPhone device family only, portrait, iOS 16 deployment minimum. Mac/Catalyst/Vision build support disabled. Version 1.0, provisional build 7.
- Production-only native configuration by default. The generated configuration previously selected a protected preview deployment; the existing archive also fails the canonical-production check. Neither is appropriate for upload. Revoke preview share access if an earlier distributed build included its credential. The old `AppStore/` files were not changed.
- Xcode Release packaging now rejects preview/local URLs, query credentials, debugging, cleartext, tablet family, and missing recovery/privacy configuration. Ten unsafe configurations are covered by regression tests.
- Branded, bundled offline recovery instead of an unhelpful/blank failed document load. Online/offline status remains visible in the running app.
- Preserved the existing local status-bar safe-area work after inspecting and backing it up. Removed native CSS that hid web headers while native replacement bars were also hidden.
- Mobile Explore now has an origin-aware Back control. Back navigation starts immediately and guards repeated taps instead of scheduling delayed history changes.
- Background share data now uses a private, non-cached GET with a timeout, outside Next.js's mutation/navigation queue. Calendar scope transitions recover from a stalled client request with a document navigation; history restoration cancels the recovery timer.
- Native share downloads have session-scoped file cache keys, protected temporary files, an ephemeral network session, same-origin redirect enforcement, and cleared pending state after failure. Every privileged native message handler checks main-frame origin.
- Cold-start and warm universal links are validated. A long-inactivity session probe distinguishes expiry/deletion/revocation from a service outage.
- Added `webcredentials` association for passkeys. Removed unused native Sign in with Apple code/capability; there is no Apple/social-login button in the current product.
- Google Calendar setup starts in a browser, keeping OAuth consent and callback in the same cookie store; returning refreshes open settings. Event writes/deletes have bounded network timeouts. CSRF/session checks remain server-side; external completion still needs a real account/device test.
- Added input labels, appropriate return-key behavior, alert semantics, retryable settings/follow/account-deletion/Google-disconnect/insights failures, optional-storage guards, and touch-origin focus restoration for Safari dialogs.
- Production cannot use the known development signing secret even with the old bypass flag. Hosted production cannot silently fall back to an embedded database. Service-worker cache write failures are handled.
- Declared required-reason sandbox file-timestamp access (`C617.1`) for native share caching. Existing permissions are limited to actual photo/camera/location features. No native push, background modes, contacts, microphone or native calendar-database capability was added.

## Evidence and coverage

| Area | Verified | Boundary / remaining work |
| --- | --- | --- |
| iOS packaging | Release simulator build, Debug simulator build, Release device archive; actual archive has `[1]`, portrait, minimum 16.0, SDK 26.5, canonical URL and bundled recovery | Signed archive fails because no Developer team is selected. No distribution profile/IPA/upload validation |
| iPhone layouts | 76 WebKit checks: 21 routes at 375×667, 393×852, 440×956; overflow, visible escape routes, dialogs, error labels, session endpoints, private share data, stalled navigation recovery | Browser viewports do not emulate UIKit safe-area geometry or Dynamic Type |
| Native simulator | iPhone SE 3: launch/current calendar, login keyboard/dismissal, weekly share preview, actual iOS share sheet, cancel/repeat/double tap, return to origin; generated PNG verified 1080×1920 | Signed-in native checks used a loopback transport with disposable accounts, not production login. Standard/Pro Max simulators installed/launched, but the Mac locked before interactive inspection finished |
| Core flows | Chrome and WebKit production audit: 15 routes/38 links per engine, search origin restoration, repeated sheets, focus, online/offline, login/logout; synthetic email-link confirmation, signup/onboarding/profile edits | No real email delivery, native passkey ceremony, deleted-account relaunch, or physical-device auth lifecycle certification |
| Calendar/data | 29 data-integrity checks, saved visibility, distant-month server/browser checks, timezone/DST/iCalendar, cancellation, recurrence, reschedule, duplicate saves/publishing, failed transactions and permission changes | Real Google consent/sync and Apple Calendar subscription delivery require device/service tests |
| Security/privacy | Cross-account and private export denial, blocks, CSRF, revocation, rate limits, cache isolation, strong-secret/hosted-database guards; zero known production dependency advisories from npm audit; live privacy/support both 200 | Provider dashboard settings, production DB backups/roles, privacy questionnaire and deployment secrets were not changed |
| Performance | 400 follows, 4,000 classes, 20 studios, 20 groups, 1,020 memberships; route-ready 58–524ms locally, CLS below .009; throttled calendar about 2.9s at 4× CPU/150ms latency/1.6Mbps | Local synthetic numbers are not device/network benchmarks or proof of 60fps. Dense following calendar reached about 14k DOM nodes; physical low-end profiling remains important |
| Accessibility | Automated WCAG pass on public/profile/group/studio/discovery/support screens, dialog focus, reduced motion, 200% text reflow; touch opener restoration corrected | VoiceOver, hardware haptics, system text sizes, keyboard/autofill and safe-area checks on a physical phone remain |
| Operations | Notifications/security/recovery suites, 118 migrations and isolated restore, production regressions, lint/typecheck/build | Existing non-blocking hook/unused-directive warnings remain outside touched stability paths. No live disaster-recovery exercise |

The calendar delayed-response test needed service workers blocked in its fault-injection context; otherwise WebKit sent the request around Playwright interception. It then passed with the response actually held. The ordinary production audit retains the real service worker.

The build's App Intents metadata message is benign: the app has no App Intents integration. No native compiler error blocks the unsigned archive.

Native haptics remain optional, rate-limited and disabled for reduced motion. Sheet threshold gestures and save flows already call the shared helper; follow completion now does too. Simulator execution cannot establish how those haptics feel on hardware.

## Manual release gates

1. **Signing:** select the correct paid Apple Developer team, enable Associated Domains, obtain distribution signing/provisioning, and successfully validate a signed archive in Xcode Organizer. Confirm build 7 is greater than the highest uploaded build.
2. **Deploy the reviewed web branch:** the shell loads the live website. These source changes are not included merely by building the native archive. Main was not merged or deployed by this audit.
3. **Fix production association:** `/.well-known/apple-app-site-association` returned **503**; set the actual `APPLE_TEAM_ID`, deploy the new endpoint, verify its `applinks` and `webcredentials` entries through Apple's service, then test fresh-install links/passkeys. The new native session endpoint returned **404** on live production because this branch is not deployed.
4. **App Store Connect:** complete beta review information, contact/feedback details, reviewer account, privacy and age rating, export compliance and agreements. Verify the bundle/version, and opt out of Mac/Vision availability where applicable. iPhone device family does not promise an absolute ban on Apple's iPad compatibility mode; recruit iPhone testers.
5. **External services:** verify production email delivery, storage, database and analytics; Google OAuth redirect URL/scopes/consent-screen test users or verification. Do not promise native push: this app currently uses in-app notifications, not APNs registration.
6. **Physical smoke test:** connect/unlock an iPhone with Developer Mode, install a correctly signed build, and complete the checklist below. The paired physical iPhone was unavailable during this audit; the Mac later locked, blocking further interactive simulator checks.

## Physical TestFlight smoke test

Use a private test account and a second test account, with no real customer data.

1. Fresh install on a small supported iPhone and a Dynamic Island/Pro Max phone. Check launch, portrait layout, status bar, bottom safe area and keyboard dismissal.
2. Sign up through the actual email link, complete onboarding, log out and log in with password. Try incorrect credentials and password recovery. Register/use/cancel a passkey.
3. Search; open person, studio, group and class screens. Follow/unfollow; use every Back/close control and edge-swipe Back. Repeat taps quickly.
4. Add/remove a class from your calendar. Create/edit/delete a test teaching and personal event. Check recurrence, a future month, overnight time and a DST boundary.
5. Share a weekly image; inspect image crop/text, cancel, retry, save to Photos, deny photo permission and try again. Open the native sheet repeatedly; send only to yourself.
6. Connect Google Calendar in the browser and return; inspect resulting timezone and duplicate behavior. Test the Apple/Outlook feed separately.
7. Background/reopen, lock/unlock, force-kill/relaunch, and open a profile/class/email link from Messages/Mail with the app closed. Confirm the intended session and destination.
8. Use airplane mode and a weak connection during launch, search, switching calendars, saving and sharing. Confirm clear recovery, no duplicate writes, no permanent spinner and a working retry.
9. Enable VoiceOver, larger text and Reduce Motion. Verify names/order/focus, tappable controls, and that gestures/haptics remain restrained.
10. Log out, log in as the second account, and verify no first-account images/private calendar data appear. Delete the disposable account, relaunch and confirm access is revoked.

Do not invite external testers until signing, live deployment/association, and the physical smoke test are complete.
