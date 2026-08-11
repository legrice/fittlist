# FittList for iOS

FittList uses a Capacitor shell around the canonical server-rendered app. This
keeps profiles, schedules and places on one deployment while allowing iOS to
provide native links, sharing, photos, notifications and calendar access.

## Identity

- App name: `FittList`
- Bundle ID: `co.fittlist.app`
- Website: `https://www.fittlist.co`
- App Store organization: pending Apple conversion

## Local setup

1. Install the latest full Xcode from the Mac App Store.
2. Open Xcode once, accept its license and install the requested simulator.
3. Select Xcode for command-line builds:

   ```sh
   sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
   ```

4. From this repository, run:

   ```sh
   npm install
   npm run ios:sync
   npm run ios:open
   ```

5. In Xcode, choose an iPhone simulator and press Run. A paid Apple Developer
   membership is not required for the simulator.

Use `CAPACITOR_SERVER_URL` when the shell should point at a preview deployment
instead of production:

```sh
CAPACITOR_SERVER_URL=https://your-preview.vercel.app npm run ios:sync
```

## After Apple converts the membership

1. Select the organization team under Signing & Capabilities in Xcode.
2. Add `APPLE_TEAM_ID` to Vercel for Production, Preview and Development. The
   universal-link endpoint uses it to publish the app identifier.
3. Confirm the Associated Domains capability includes `applinks:fittlist.co`.
4. Add Sign in with Apple and Push Notifications capabilities.
5. Create the App Store Connect record with bundle ID `co.fittlist.app`.

## Before TestFlight

- Replace the generated icon with a final opaque 1024-by-1024 app icon.
- Create a branded launch screen.
- Verify sign-in, sign-out and account deletion inside the native shell.
- Verify profile, place and class universal links.
- Verify image sharing, image upload, external booking links and offline copy.
- Add native push registration and device-token storage.
- Complete App Store privacy answers and provide a reviewer demo account.

The repository already provides a public privacy policy, immediate account
deletion, blocking, reporting and moderation. Those should be exercised in the
native regression suite rather than rebuilt separately.
