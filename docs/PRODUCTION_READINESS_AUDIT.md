# FittList production-readiness audit

Date: September 4, 2026. Branch: `experiment/calendar-personal-following`.

This pass changes implementation and adds repeatable regression checks. It does not certify every browser/device combination or App Store acceptance. Work stayed on the existing experiment branch. No production database, deployment, live account, or `main` checkout was changed. Existing untracked `.vercel/` and `AppStore/` content was preserved.

## Critical fixes completed

- **Password authentication:** durable, atomic limits by IP, IP/account, and account; identical incorrect-password responses for missing and passwordless accounts; dummy scrypt verification; bounded input lengths. Email-link limits now use the same atomic counters rather than raceable count-then-insert checks. The existing verified-email signup requirement remains intact.
- **Session revocation:** sessions carry a database version. Password changes/reset increment that version transactionally and renew the current browser's session; other sessions stop working on their next request. Deleted accounts also fail session verification. Legacy sessions work at version zero until revoked. Logout clears pending reset/email-link cookies.
- **Google Calendar OAuth:** connect consent now requires a random, browser-bound state cookie and the same currently signed-in account before code exchange. Signed state alone previously allowed consent to be replayed from another browser. Google and Apple token exchanges have a ten-second timeout; failed Google exchanges return to a recoverable screen.
- **Social authorization:** likes/comments validate actor access, active following, blocks, public class/attendance visibility, actual occurrence dates, and shift assignments. Comments have a durable submission limit. Feed rendering omits blocked authors/likers. A duplicate like insert no longer causes a unique-key exception.
- **Image security:** stored uploads restrict raster formats, validate decoded metadata, enforce byte/pixel bounds, and time out storage requests. Server-rendered profile/story images resolve and pin public IP addresses, recheck redirects, reject internal/reserved destinations and non-HTTPS URLs, and bound download time/size. Unavailable images use existing no-photo layouts. User-supplied SVG cannot run through the private background endpoint.
- **Private data:** session-dependent share backgrounds use `private, no-store`. Personal calendar subscriptions filter blocked accounts, avoid reading every cover row, and include a viewer's own private assigned shifts without exposing followed coaches' private classes.
- **Browser protection:** added MIME-sniffing prevention, no-referrer policy, object/base restrictions, and frame restrictions. The intentional public embed route remains frameable. This is a baseline CSP, not a complete nonce-based script policy.
- **Build reliability:** repaired the obsolete `next lint` command and missing database migration entry point. The sitemap now runs at request time so a build does not need a live database. Build checks use the Node/tsx loader without the CLI's extra IPC socket.

## Performance improvements

- You/Following navigation no longer waits sixty milliseconds for an animation before routing. Existing prefetching remains, and modified-click behavior works normally.
- Front-sheet movement updates compositor styles once per frame instead of setting React state and rerendering the calendar on each move. CSS transitions are disabled while a finger owns the drag.
- Social reactions/comments are grouped once by occurrence instead of rescanning all social rows for each calendar item.
- Password login fetches a small identity projection instead of an entire user record, including potentially large profile images.
- Personal-calendar sheets open immediately with cached content or a loading/recovery surface. Failed reads cannot reopen a closed sheet or poison subsequent retries. Calendar continuation failures retain loaded content and offer retry.
- Existing lazy-loaded editors, account-scoped memory caching, thumbnail/list projections, and Vercel Speed Insights were retained. Speed Insights loads only on Vercel deployments, avoiding unavailable telemetry requests in local/self-hosted environments. Regression tests cover cache isolation, deduplication, invalidation, and recovery after a timed-out read.

### Measurements and scope

Production-build measurements use disposable local PGlite fixtures, not the production database. Browser timing and accessibility results are recorded by `scripts/production-audit.mjs`. These are smoke measurements, not population percentiles or a production INP claim. Vercel Speed Insights remains the field measurement path for LCP, INP, CLS and TTFB.

Final run: Chromium, WebKit and Firefox pass. The saved [machine-readable results](production-audit-results.json) include assertions, metrics and request diagnostics without fixture credentials.

| Local browser run | LCP | TTFB | DOM ready | CLS |
| --- | ---: | ---: | ---: | ---: |
| Chromium | 768 ms | 411 ms | 454 ms | 0.0082 |
| WebKit | 165 ms | 44 ms | 97 ms | unavailable |
| Firefox | unavailable | 50 ms | 124 ms | unavailable |

Chromium recorded zero long tasks during this initial-load sample. With 4× CPU throttling, 150 ms latency and 1.6 Mbps download throughput, the Calendar navigation became available in **2.34 seconds**. Engines ran sequentially against the same local server, so their cache/server warmup conditions differ; this table is not a browser ranking. Unsupported or unobserved metrics are stored as `null`, not a successful zero. Screenshots and fixture-server logs for this run are in `/var/folders/b4/hzgb9bld3qndvll6chb_lrx80000gn/T/fittlist-audit-Qn2D7w/` and may be removed by normal temporary-file cleanup.

The built initial JavaScript estimates are 171 kB for Calendar, 205 kB for Following, 139 kB for Discover, and 103 kB shared by all pages. No pre-change comparable bundle baseline was captured, so no bundle reduction percentage is claimed.

## Interaction improvements

- Shared front-sheet drag recognition: vertical intent, top-of-scroll ownership, resistance beyond the threshold, velocity-aware release, cancellation reset, click suppression after a drag, and a single tactile threshold cue.
- Central haptics utility supports Capacitor and optional browser vibration. Unsupported environments fail quietly. Rate limiting prevents haptic chatter; reduced motion suppresses feedback. Added intentional confirmation to follow and calendar-save interactions.
- Shared motion durations extend the existing CSS tokens. Reduced-motion overrides include late CSS rules and JavaScript-owned sheet closing.
- Calendar save updates immediately, prevents concurrent submissions, and rolls back with a useful error on failure. Follow controls surface failure instead of silently doing nothing.
- Search closes with Escape and retains keyboard focus in its sheet. Onboarding errors stay recoverable, and successful setup lands on the canonical Calendar route.

## Mobile / iOS readiness

- Compiled the native iOS simulator app with Xcode 26.6 and code signing disabled. The Capacitor haptics plugin is registered through the Swift package and `cap sync ios` succeeds.
- Info.plist and the app privacy manifest pass `plutil -lint`.
- Native listeners clean up even if plugin registration resolves after unmount. Optional bridge failures no longer become unhandled promises. Universal links preserve the current origin even for paths beginning with `//`.
- Offline status now works in ordinary browsers as well as the native shell. Existing safe-area handling, camera/share bridges, dynamic viewport styling, and password-manager autocomplete were inspected and retained.
- Mobile calendar controls and close controls have at least 44-pixel targets. Sheets contain overscroll; zoom has not been disabled.
- A simulator compile and WebKit viewport emulation do not validate physical haptics, iPhone keyboard geometry, VoiceOver, system share targets, rotation with the keyboard open, or native back gestures. Those remain device checks.

## Cross-browser fixes

- WebKit testing exposed focus leaving a modal because Safari's Tab preference can skip buttons. Dialog traversal now explicitly covers the full eligible control order on every engine.
- Non-passive native touch listeners claim only a downward sheet gesture, avoiding React's passive-touch `preventDefault` problem. Other scrolling remains native.
- Storage denial no longer breaks You/Following navigation. Modified links retain standard browser behavior.
- Native API availability, optional vibration, image failures, and network loss have fallbacks. Chromium, WebKit and Firefox checks pass. These are engine tests; branded Safari, Edge and Android Chrome still require a device/browser release matrix.

## Accessibility improvements

- Shared modal focus containment, focus restoration, and inert background siblings, including nested portal branches.
- Search has a keyboard exit; calendar expansion remains available through labeled buttons in addition to dragging.
- Focus-visible outlines and mobile target sizing complement existing semantic controls.
- Hidden toast actions are inert, and stale messages are removed from live regions.
- Fixed low-contrast footer text found by axe. Automated axe coverage is the main mobile calendar, not a claim that every editor and contrast combination is fully audited.

## Validation

- `npm run build`: passes, including copy, color, weight, icon, native navigation, share rendering/performance, content safety, timezone/DST, calendar transaction, purge, rate-limit and email-follow checks.
- `npm run typecheck`, `npm run lint`, `npm test`: pass. Run the type check after the build; both use `.next/types` and must not run concurrently.
- `npm audit --omit=dev`: zero advisories. The full dependency audit still has seven moderate development-tool advisories (Drizzle tooling's esbuild chain and Capacitor CLI's xcode/uuid chain). Avoid exposing development servers; a forced downgrade or unrelated framework migration was not applied.
- Framework/library updates: Next 15.5.21 → 15.5.25; Drizzle ORM 0.41 → 0.45.2; Drizzle Kit 0.31.10; patched Sharp, PostCSS and xmldom. React was already patched in the installed lockfile. New tooling provides ESLint, axe, and portable browser checks.
- The build reports existing hook-dependency warnings and unused ESLint suppression comments (68 warnings in this environment); no lint errors. Those warnings should be reviewed incrementally rather than blindly changing every effect dependency.
- Tracked-file scan found no matching live-token/private-key patterns. This is not a full git-history or production secret-manager audit.
- Browser fixtures exercise real Server Actions over HTTP, without adding any production test/debug endpoint: signed-out access, cross-account record/image access, public/private exports, CSRF rejection, social access/blocks, idempotent save, creation/removal, follow/unfollow, password rate limits, password-change revocation, upload/background caching, schedule-image generation, email-link account creation, onboarding and profile editing.
- Browser UI coverage includes mobile/desktop navigation, You/Following, touch cancellation/release, back/forward, deep links/refresh, discovery, search, coach/studio pages, settings, add entry, modal focus, offline/reconnect and password sign-in/sign-out. Email delivery is represented by an isolated pre-seeded email token; real provider delivery is not exercised.
- The main mobile Calendar has zero axe violations in Chromium, WebKit and Firefox. Screenshots cover mobile and desktop layouts; animations are completed for visual inspection.
- WebKit recorded a localhost navigation access-control diagnostic alongside canceled requests during rapid navigation. It is retained in the machine-readable results and excluded narrowly from the unexplained-error assertion. This is not a claim of a completely silent console; verify the behavior on branded Safari. Chromium and Firefox recorded no JavaScript errors.

## Remaining risks

1. **Calendar-comment moderation is incomplete.** The new comment type is not integrated into the existing content-report/delete UI. Filtering and blocking are enforced, but moderators and users still need a report/removal path for individual calendar comments before broad public release.
2. **Native release checks:** physical iPhone/iPad testing, VoiceOver, real Apple/Google OAuth, calendar disconnect/reconnect, passkeys, share/save-to-Photos, and archive/App Store validation still need real accounts and devices. No production integrations were mutated during this pass.
3. **Long-lived capabilities:** calendar subscription links remain permanent bearer tokens without a user-facing rotation/revocation control. Logout removes the current cookie but does not revoke a stolen copy of that same JWT; password reset/change now revokes older sessions. Per-device sessions/revocation would require a broader session design.
4. **Scale and operations:** public image generation needs deployment-level abuse limits. Discovery, sitemap and long calendars still contain broad queries; use production query plans and realistic dataset/load tests before adding pagination or indexes. Database migrations currently run lazily on first connection; move them to a controlled deployment step as usage grows.
5. **Field performance/observability:** this pass does not establish production p75 INP or a production load/concurrency budget. Review Speed Insights and structured error monitoring with a defined privacy/retention policy. Third-party service failures and real PostgreSQL concurrency require staging validation.
6. **Full accessibility/browser coverage:** axe on Calendar is not a VoiceOver audit or coverage of every legacy modal/editor. Physical Safari/iOS, Android Chrome, branded Edge and native gesture testing remain release gates. Existing lint warnings are listed above.

Apple requires UGC filtering/reporting/blocking, accessible account deletion, suitable login options and sufficient app functionality; the remote-content shell and new calendar comments deserve explicit review against these requirements. Actual acceptance is an App Review decision. See [Apple's App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/).

## Recommended next steps

1. Review this branch and apply migration `0117_fixed_pyro.sql` through the normal deployment process. It adds `users.session_version` with default zero; no production migration was run here.
2. Complete calendar-comment reporting/removal, then run a TestFlight release checklist on real devices with staging Google/Apple accounts.
3. Add calendar-token rotation and per-device session revocation; configure perimeter limits for expensive public render endpoints.
4. Measure real database/query and Web Vitals distributions before the next performance pass.

## Important files changed

- `src/app/actions/auth.ts`, `src/lib/session.ts`, `src/lib/password.ts`, `src/db/schema.ts`, `drizzle/0117_fixed_pyro.sql`
- `src/app/api/google/{connect,callback}/route.ts`, `src/lib/oauth-state.ts`
- `src/lib/server-image.ts`, `src/lib/storage.ts`, `src/lib/storyimage.tsx`, profile OG/card routes, private background route
- `src/lib/calendar-activity-access.ts`, `src/app/actions/calendar-social.ts`, `src/lib/discoverfeed.ts`, personal calendar feed
- `src/lib/use-front-sheet.ts`, `src/lib/motion.ts`, `src/lib/haptics.ts`, `CalendarScreen`, `FollowingScreen`, `PersonalCalendarSheet`
- `ScrollLock`, `SiteSearchSheet`, `ClassCardActions`, `RowFollow`, `Toast`, `AuthFlow`, `OnboardingWizard`, `NativeAppBridge`, `globals.css`
- `next.config.ts`, `src/app/layout.tsx`, `package.json`, lockfile, ESLint config, migration runner, sitemap, native Swift package
- `scripts/audit-fixtures.ts`, `scripts/production-audit.mjs`, `scripts/production-regressions.ts`

### Reproduce locally

```sh
npm ci
npm run build
npm run typecheck
npm run lint
npm test
npm audit --omit=dev
# Install Playwright browsers once, or set PLAYWRIGHT_BROWSERS_PATH.
npx playwright install chromium webkit firefox
# The fixture creator prints a disposable fixtures.json path.
node --import tsx scripts/audit-fixtures.ts
AUDIT_FIXTURES=/absolute/path/printed/fixtures.json npm run test:browser
```

The browser runner binds localhost:3100, supplies a generated local-only signing secret, disables external email/blob credentials, and shuts down its test server afterward. Start with new fixtures for another complete run: password revocation and account creation intentionally mutate the disposable accounts.
