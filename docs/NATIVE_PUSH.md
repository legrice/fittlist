# Native push notifications

The iOS app uses Capacitor Push Notifications and Apple Push Notification service (APNs). TestFlight uses **production** APNs. Web push remains separate and uses the existing VAPID settings.

## Delivery and controls

On a build containing the push plugin, open Settings → Notifications → On this iPhone and enable push. iOS asks for permission only after the user enables it. Follows and Messages can be switched independently. Site administrators in `ADMIN_EMAILS` also have an All app activity switch; studio administration alone does not grant site-wide alerts.

Recipient alerts cover new follows, follow requests, follow approvals, inquiry messages and feedback replies. Existing explicit push calls for other updates also reach registered iOS devices. Admin alerts cover signups, follows/unfollows, favorites, saved classes, group membership/invitations/posts/comments/settings, class changes, studio schedule changes, profile changes, event registrations/settings, content reports, share exports, profile views, schedule opens and town-flyer link opens. Admin message activity contains no private message text. A flyer alert means the QR link was opened, not that a camera merely detected the code. Known bots and prefetches are excluded.

Device registrations are bound to the current account, session version and expiry. Logout removes the current installation. Account deletion cascades through devices and pending deliveries. The dispatcher checks current ownership, preferences, session validity and admin status again before sending. Tapping an alert opens its local destination.

A durable database outbox is written before sending. Next.js response-lifetime work attempts immediate delivery. `/api/cron/push` retries every five minutes and requires `CRON_SECRET`. Temporary failures use exponential backoff, with a maximum of eight attempts and a 24-hour expiry. Invalid or unregistered device tokens are removed. As with other retrying delivery systems, a process crash after Apple accepts a push but before the database acknowledges it can cause a duplicate.

## Production activation

1. Enable Push Notifications for Apple App ID `co.fittlist.app` in team `58MG79EU7S`.
2. Create a dedicated APNs signing key with the narrowest available production/topic scope for this app. Keep the downloaded `.p8` file outside the repository.
3. Add production-only Vercel secrets:
   - `APNS_KEY_ID`: key identifier from Apple.
   - `APNS_TEAM_ID`: `58MG79EU7S`.
   - `APNS_PRIVATE_KEY`: full `.p8` contents, preserving newlines (escaped `\n` is also accepted).
   - `APNS_ENVIRONMENT`: `production`.
   - Ensure `CRON_SECRET` and `ADMIN_EMAILS` are configured.
4. Redeploy the server so the secrets become available. Migration `0124_native_push` runs through the existing lazy migration system. No credentials belong in client configuration or git.
5. Sync the iOS project, refresh provisioning with the push entitlement, increment the build number, archive and upload a new TestFlight build. Existing build 8 cannot receive native push because it lacks the plugin.
6. Install the new TestFlight build on an iPhone and enable notifications. Verify one follow, one message and one town-flyer link open with isolated test accounts. Check delivery in foreground, background and terminated states, then tap each notification. Verify opt-out and logout stop later deliveries.

Credentials, Apple capability activation, upload and real-device delivery must be verified separately; passing automated checks does not establish those results. The app displays a setup notice and disables opt-in while APNs secrets are missing.

## Checks

- `npm run check:push`: isolated migration, recipient categories, admin privacy, preferences, session revocation, account switching, retries, invalid-token removal and deletion cascade, using a fake APNs transport.
- `npm run check:push-api`: production HTTP server with disposable fixtures; authentication, origin validation, payload validation, admin scope, device ownership, token refresh, opt-out and cron authorization. Requires `npm run build` first. No Apple requests are sent.
- `npm run check:ios-release` and an Xcode Release simulator build validate the native integration. Apple delivery still requires a signed physical-device build.

Apple reference: https://developer.apple.com/documentation/usernotifications/establishing-a-token-based-connection-to-apns
Capacitor reference: https://capacitorjs.com/docs/apis/push-notifications
