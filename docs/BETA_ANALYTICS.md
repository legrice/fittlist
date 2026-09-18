# Beta usage dashboard

Admin accounts can open `/admin` and find **Beta usage** below the summary cards. It combines native and web usage over rolling 7/28-day windows. Daily breakdowns use UTC calendar days.

Metrics include active accounts, previous-period returning accounts, new accounts, onboarding, first core actions, invitation acceptance, feature adoption, signup sources, and up to 20 accounts that may need help. Admins, gym/placeholder accounts, review@fittlist.co, and comma-separated ANALYTICS_EXCLUDED_EMAILS are excluded from usage reports.

Passive app, calendar, explore, class-detail and error signals start with this release. Older visits cannot be reconstructed. Signals contain account ID, event kind and time only; they exclude screen URLs, searches and message content. Daily signals count unique account-days. Recorded feature actions may include repeated requests. Week-2 retention requires accounts with a fully observed signup week and 14 days of observation, so it is initially empty. Activation and invitation acceptance are measured to date.

The iPhone push health section reports credential presence, unexpired registrations, queue depth and retries. Its test button queues notifications only for the signed-in admin's devices that allow important updates. Neither credential presence nor queue acceptance proves delivery.

## Build 10

The notification bell contains Notifications and Messages. You > Preferences contains notification settings, including separate native push toggles for followers, messages and important updates (plus admin activity for admins).

Deploying the web app does not upload an iOS binary. Build 10 still requires a signed archive and TestFlight upload. Apple push delivery requires APNS_KEY_ID, APNS_TEAM_ID, APNS_PRIVATE_KEY and CRON_SECRET in production; APNS_ENVIRONMENT must be production for TestFlight. Download the actual .p8 key file using a browser that saves it to the Mac, rather than recording its key ID. See NATIVE_PUSH.md for setup and validation. Keep scheduled emails disabled unless separately enabled intentionally.

Validation: `npm test`, `npm run check:push-api`, `npm run check:notifications-browser`, and `node scripts/beta-browser-audit.mjs` (the browser/API checks use a current production build and isolated local databases).
