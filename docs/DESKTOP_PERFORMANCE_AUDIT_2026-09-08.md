# Desktop performance audit, September 8, 2026

Audited shared desktop navigation, route loaders and production bundles, plus HTTP responses for Calendar, Following, Discover, Share, Messages, Notifications, Settings, Admin, and person/studio/group profiles. Inspected the live Safari session on Following and Discover.

## Implemented

- Defer Add's class editor, class browser and group creator until opened. Defer the account dashboard behind its existing sheet. These components previously entered the shared desktop bundle even when their interfaces were closed.
- Load managed studios with one manager-to-studio join instead of two membership queries followed by another studio query. Ordinary staff memberships are not needed by the management switcher. Existing owner/admin group rules are preserved.
- Fetch one latest message per conversation in SQL, with deterministic ordering, rather than reading the whole history into application memory.
- Filter message recipients in SQL and select their thumbnail with an original-photo fallback, rather than selecting every user's original and thumbnail before filtering.
- Reuse the request-scoped viewer loader in Messages and Notifications, avoiding a separate identity query when their navigation renders.
- Add the existing pending-link indicator to Messages, Notifications and Admin so these links acknowledge navigation consistently.

## Bundle measurements

Unique initial JavaScript files from the production app build manifest, including root and applicable tab layouts. Sizes use local gzip compression; this measures transferable code, not browser load time. Baseline is the production build present at audit start. Earlier sentence/sidebar edits are also included in the rebuilt tree.

| Route | Before gzip | After gzip | Reduction |
| --- | ---: | ---: | ---: |
| Messages | 304.3 KiB | 237.0 KiB | 22.1% |
| Discover | 309.4 KiB | 256.4 KiB | 17.1% |
| Calendar | 303.0 KiB | 291.7 KiB | 3.7% |

## Repeatable validation

Final production build passed, including its required checks. The final 11-route audit passed; local browser verification confirmed sign-in, desktop navigation and the deferred teaching-class editor. Warm responses in the final stressed-fixture run ranged from 34 to 79 ms; these are not directly comparable to the earlier small-fixture run.

Run `npm run build`, then `npm run check:desktop-performance`. The audit creates and closes its own temporary PGlite database, launches a local production server, requests each route three times, and prints a JSON report location. It seeds a conversation with 2,000 historical messages and a 2 MB original photo with a thumbnail. It asserts that the newest preview renders, historical messages and the original photo do not enter the inbox response, and the managed studio remains visible. No production account data is used.

The initial small fixture returned warm responses in approximately 22–58 ms. Its first authenticated Calendar request took 1.15 seconds, including embedded database startup. These numbers do not establish production speed: local database calls have no Neon network latency, and the fixture has very few users/calendars. Measurements are diagnostic, not fixed timing assertions.

## Findings still requiring production measurements

- Discover first renders empty directory props, then loads the selected directory through a server action after hydration. Its HTTP shell timing excludes this second request. The code split helps hydration, but does not remove that request chain.
- Admin still scans full user/studio tables and builds the activity feed on every visit. It has multiple sequential query groups. Large images and account growth can increase database transfer and computation even though those images are not displayed there.
- The shared shell still awaits badge and managed-calendar data. The join reduces work, but production query latency, connection startup and pool saturation need authenticated server traces to attribute the reported site-wide delay.
- A single unauthenticated live request returned its redirect in approximately 0.98 seconds. That is not an authenticated page-load measurement and cannot identify a database or hosting cause.
- No authenticated production network waterfall, browser LCP/INP measurements, or hosted database query timings were captured. The improvements are local and have not been deployed.
