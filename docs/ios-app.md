# FittList for iPhone

FittList is a Capacitor shell around `https://www.fittlist.co`. The server-rendered product must be deployed separately from the native binary. Building or uploading the shell does not deploy a Git branch.

## Release identity

- Display name: **FittList**
- Bundle identifier: `co.fittlist.app`
- Marketing version: `1.0`
- Current build: `7`, provisional until checked against App Store Connect
- Minimum deployment: iOS 16.0
- Device family: `1` (iPhone), portrait only
- Catalyst, Mac-designed-for-iPhone and Vision-designed-for-iPhone build support disabled
- Existing branded 1024px opaque icon and launch storyboard retained

Family 1 removes the native iPad target/layout. Apple may still offer an iPhone app in iPad compatibility mode; do not claim a complete iPad installation ban or add fictitious hardware requirements. Check App Store Connect's Mac and Apple Vision Pro availability separately.

## Local testing

Install dependencies and use full Xcode. Production is the default:

```sh
npm ci
npm run ios:sync
npm run ios:open
```

An explicit development shell can load one exact HTTPS preview host or HTTP loopback:

```sh
CAPACITOR_ENV=development CAPACITOR_SERVER_URL=http://localhost:3130 npm run ios:sync
```

Development configuration cannot be archived as Release. URLs containing credentials, query parameters or fragments are refused. Do not put deployment bypass tokens in a native configuration or binary.

Before archiving, restore production and run the gate:

```sh
CAPACITOR_ENV=production CAPACITOR_SERVER_URL=https://www.fittlist.co npm run ios:sync
npm run check:ios-release
```

Xcode also runs `scripts/check-ios-release.py` on every Release build, including builds started through the GUI. It verifies the generated configuration, iPhone family, disabled debugging, offline asset, and file-timestamp privacy declaration. A stale preview configuration fails closed.

## Apple setup and archive

1. Select the correct paid Developer team under Signing & Capabilities. Obtain the appropriate distribution signing/provisioning configuration. The repository intentionally does not guess the current organization team.
2. Enable Associated Domains for `co.fittlist.app`. The entitlements are `applinks:www.fittlist.co` and `webcredentials:www.fittlist.co`.
3. Set `APPLE_TEAM_ID` in the production web deployment. Confirm `https://www.fittlist.co/.well-known/apple-app-site-association` returns 200 JSON, without redirects, containing this team's app identifier for both services. It returned 503 during the 2026-09-07 audit.
4. Deploy the reviewed web changes through the normal approved release process. Recheck authentication, sharing and associations against the live origin.
5. Confirm the highest uploaded build number; increase build 7 if it is already used. Choose a generic iOS device and **Product > Archive**. Validate the signed archive before uploading.
6. In App Store Connect, check identity, iPhone-only product description, availability on Mac/Vision, privacy answers, age-rating answers, export-compliance answers, beta description, feedback email, review contact and a working reviewer account. Complete external beta review and any outstanding agreements.

The installed toolchain during the audit was Xcode 26.6 with iOS SDK 26.5. Apple requires SDK 26 or later for uploads from April 28, 2026. The deployment minimum and upload SDK are separate settings.

Do not upload the pre-existing archive under `AppStore/`: its embedded server configuration is not canonical production. That archive and directory have been left unchanged.

## Native behavior and permissions

- UIKit reserves the top/side safe areas and paints the status-bar surface. The web product owns its visible headers, calendar controls and navigation. The bottom inset remains available to CSS.
- A bundled offline page handles failed document loads. In-app network loss shows a reconnect banner. Offline editing is not supported.
- Warm and cold universal links are validated and rebased to the shell's origin. Long inactivity triggers a session check; a server outage is not treated as logout.
- Native PNG sharing has bounded caching, session-scoped cache keys, cancellation and retry, protected local files, and same-origin redirect enforcement. Share caches are temporary, not synchronized.
- Camera, selected photos, photo-library saving and location descriptions correspond to actual optional features. No contacts, microphone, native calendar database or background-location permission is requested.
- There is no native push registration/APNs entitlement/background mode. In-app notifications work; do not promise native push to TestFlight testers.
- The current login UI uses email/password, email links and passkeys. The unused native Sign in with Apple handler and entitlement were removed. Google Calendar is a calendar connection, not a login button; it now starts in a browser so consent and callback share a cookie jar.
- The privacy manifest declares sandbox file timestamps (`C617.1`) for share-cache maintenance. Capacitor 8.5's key-value store uses files, not UserDefaults; a speculative UserDefaults declaration was not added.

Review privacy answers against actual production analytics, image storage, database, email and Google configuration. A manifest is not a substitute for App Store Connect's privacy questionnaire.

## Verification

See [the iPhone release audit](IPHONE_TESTFLIGHT_AUDIT_2026-09-07.md) for evidence and remaining release gates. Useful commands:

```sh
npm run typecheck
npm run lint
npm test
npm run check:data-integrity
npm run check:operations
npm run check:production-environment
npm run build
npm run check:iphone-browser
npm run check:ios-release
```

The browser audits use disposable accounts and local databases. Never point them at production or include fixture files, cookies, environment files, or protected preview URLs in reports.

References: [Apple SDK upload requirement](https://developer.apple.com/news/?id=ueeok6yw), [passkey association requirements](https://developer.apple.com/documentation/authenticationservices/connecting-to-a-service-with-passkeys), [external TestFlight review](https://developer.apple.com/help/app-store-connect/test-a-beta-version/invite-external-testers), [Vision Pro availability](https://developer.apple.com/help/app-store-connect/manage-your-apps-availability/manage-availability-of-iphone-and-ipad-apps-on-apple-vision-pro).
