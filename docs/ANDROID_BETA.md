# Android beta release

The Capacitor Android app uses package `co.fittlist.app`, version 1.0, versionCode 1, target API 36 and minimum API 24. It loads the canonical production application over HTTPS. Web app features, analytics, and account permissions are shared with iPhone and web. Android additionally has hardware-back handling, system-bar styling, branded launcher/splash images, restricted app links and Firebase push.

## Remaining account setup

1. Sign into Google Play Console and select FittList LLC's developer account, or register one. Registration, verification, fees and agreements are completed by the account owner.
2. Register `co.fittlist.app` as an Android app in a Firebase project. Download `google-services.json` to `android/app/google-services.json`. This client configuration is ignored by Git. Do not substitute a service-account key here.
3. Enable the Firebase Cloud Messaging HTTP v1 API. Create a dedicated service account with only Firebase Cloud Messaging API Admin permissions for this project. The account owner completes credential creation. Store its project_id, client_email and private_key as production Vercel secrets FCM_PROJECT_ID, FCM_CLIENT_EMAIL and FCM_PRIVATE_KEY, then redeploy. The private key must never be included in the Android bundle or Git.
4. Accept Google's SDK license and install platform API 36, build tools 36.0.0 and platform tools. This Mac's Java 21 and command-line SDK tools are installed with Homebrew; the SDK installation is waiting for owner license consent. Local SDK root: `/private/tmp/fittlist-android-sdk` (temporary; install to a durable location before relying on later builds).

## Signing and build

An upload key was created in `.release/android/fittlist-upload.jks`, with local signing settings in `.release/android/signing.json`. Both are private and ignored by Git. Preserve these files securely for subsequent updates. `scripts/android-create-upload-key.mjs` refuses to replace an existing key.

Run:

```
npm run android:sync
npm run check:android-release
npm run android:bundle
```

`android:bundle` requires Firebase client configuration, production shell configuration, SDK and release signing. It reads the local signing settings, or accepts FITT_ANDROID_KEYSTORE, FITT_ANDROID_STORE_PASSWORD, FITT_ANDROID_KEY_ALIAS and FITT_ANDROID_KEY_PASSWORD from the environment. Set JAVA_HOME and ANDROID_HOME for a different toolchain location.

Output: `android/app/build/outputs/bundle/release/app-release.aab`. The bundle is checked with jarsigner after building. Increment versionCode for every later Play upload. Debug builds are not distribution artifacts.

## Play Console internal test

Create the app FittList, English, app, free. Enable Play App Signing using Google's generated app-signing key and the local upload key. Upload the signed AAB to **Testing > Internal testing** and add the friends' Google-account email addresses to a tester list. Share the opt-in link manually after the release is available; no invitations are sent automatically by this repository.

The Play Console needs a store listing, app access/review credentials, privacy policy, data safety answers, content rating, target audience and relevant app-content declarations. Use the real demo account that has representative content and all features. Do not put its password in this document.

Store assets are in `release-assets/google-play`: 512px icon and 1024x500 feature graphic. Capture phone screenshots from an actual Android build; iOS screenshots are not substitutes.

Proposed listing:

- Title: FittList
- Short description: Find fitness classes, follow coaches, and plan your week.
- Full description: FittList brings your fitness week together. Discover classes and coaches, follow the calendars you care about, and save classes to your own schedule. Connect with coaches through messages, explore studio schedules, and keep up with important updates. Coaches can publish classes and share their calendars with their community.
- Privacy policy: https://www.fittlist.co/privacy
- Support and account-deletion instructions: https://www.fittlist.co/support

Data safety must reflect the actual production features. The app can collect account/profile information, messages, optional location/photo information, app interactions, and device notification tokens. Check the privacy policy and third-party service use before submitting; the prepared text does not fill declarations automatically. No Firebase Analytics SDK was added and Firebase automatic analytics collection is disabled in the manifest.

New personal developer accounts may need 12 continuously opted-in closed testers for 14 days before applying for production access. Internal testing can be used first; internal testing does not satisfy that closed-test requirement. Organization-account requirements differ. See https://support.google.com/googleplay/android-developer/answer/14151465.

## App links

The website's `/.well-known/assetlinks.json` is backed by `/api/android-app-links`. Set ANDROID_APP_LINK_FINGERPRINTS to comma-separated SHA-256 signing certificate fingerprints (colon-separated bytes). For Play-installed builds, use the **app signing certificate** shown in Play Console, not just the upload certificate. Add a local signing certificate only when testing locally signed builds. Missing fingerprints return 503 instead of falsely claiming verification. OAuth/calendar-connect links remain in the external browser; Android's manifest registers specific app paths rather than all site URLs.

## Validation before sharing

Install the signed Android build on a real phone or emulator. Verify email/password login, magic-link entry, calendar saving, attribution, profiles, message threads, foreground/background notification delivery and taps, notification opt-out, keyboard/layout behavior, Android Back, sharing/photo access, app resume, offline error recovery and sign-out/account switching. Dashboard **Android push health** shows Firebase credential presence and registration counts; test delivery only to the signed-in admin's Android devices. Backend configuration and mock tests alone do not demonstrate actual Firebase delivery.
