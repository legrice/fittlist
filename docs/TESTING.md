# Release checks

The maintained checks run in `.github/workflows/quality.yml` for pushes and pull
requests. They build the production app, type-check it, lint it, run the regression
suite, and exercise the production build in Chromium using a fresh disposable
database. No live database or service credentials are used.

## Maintained suites

| Command or file | Coverage |
| --- | --- |
| `npm run build` | Production compilation plus copy, icon, color, weight, native navigation, sharing, content safety, time-zone, atomicity, purge, rate-limit, and email-follow checks |
| `npm run typecheck` | TypeScript contracts, including audit fixture code |
| `npm run lint` | ESLint errors in application and scripts |
| `npm test` | Password limits, image validation, sheet gesture thresholds, cache isolation, timeouts, and retry behavior |
| `npm run check:data-integrity` | Real isolated scheduling actions, rollback/retry behavior, permissions, group visibility, recurrence, and saved-calendar loaders |
| `npm run check:calendar-window` | Bounded monthly loads, leap years and range validation, future recurring/dated/group classes, canceled/private/blocked exclusion and viewer isolation; also included in data integrity |
| `npm run check:following-month-browser` | Six scenarios: future recurring/dated/group classes and empty days, failure/retry, day continuation, retained data, saving a future class, and search-close refresh restoring its selected date |
| `npm run check:desktop-browser` | Direct calendar entry, desktop rail at 940/1024/1440/1920px, profile header geometry, centered dialogs and focus, page navigation/Back, managed calendars, and the mobile breakpoint |
| `npm run check:operations` | Notification pagination and acknowledgement, delivery error accounting, signed unsubscribe links, production configuration guards, migration replay, snapshot restore, and connection cleanup |
| `scripts/production-audit.mjs` | Production browser navigation, accessibility, onboarding, authentication, social permissions, offline recovery, and response timing |
| `npm run check:notifications-browser` | Legacy page and sheet pagination beyond 50 notifications, failed initial/older-page/cached refresh recovery, unread state, and viewer isolation |
| `scripts/scale-visual-audit.mjs` | 400 follows, 4,000 classes, long names, portrait/missing images, multiple viewport widths, larger text, keyboard focus, and broader axe scans |

The build includes Next.js type and lint validation, but the explicit commands
make those checks visible independently and also cover scripts beyond Next's
route graph. The standard browser suite defaults to Chromium, WebKit, and Firefox;
CI currently gates Chromium only. Other engines need their Playwright browsers
installed before a local run.

## Local browser audit

Build first. Every run must seed new fixtures because the production suite
intentionally changes passwords, saves classes, blocks users, and completes
onboarding for synthetic accounts.

```sh
NEXT_PUBLIC_ORIGIN=http://localhost:3100 npm run build
npx playwright install chromium
task_fixture_path=$(DATABASE_URL= node --import tsx scripts/audit-fixtures.ts | tail -n 1)
AUDIT_FIXTURES="$task_fixture_path" AUDIT_BROWSERS=chromium npm run test:browser
```

The public origin is compiled into authentication redirects. For this audit,
build with `NEXT_PUBLIC_ORIGIN=http://localhost:3100`; changing only the server’s
runtime environment does not change those built redirects.

On a Mac with Chrome installed, set `AUDIT_CHROME_CHANNEL=chrome` to use it in the
production audit instead of downloading bundled Chromium. The production runner
owns port 3100 and stops its server when it finishes.

The notification browser check seeds its own disposable fixture and uses port
3188. Run `npm run check:notifications-browser` after the build. It defaults to
bundled Chromium and also accepts `AUDIT_CHROME_CHANNEL=chrome` locally. It
blocks external browser requests and never contacts email or push providers.

The Following month browser check seeds its own disposable fixture and owns port
3191. Run `npm run check:following-month-browser` after the build; use
`AUDIT_CHROME_CHANNEL=chrome` for installed Chrome locally. It defaults to bundled
Chromium in CI. `FOLLOWING_MONTH_FIXTURES` can reuse this check's own fixture; it
intentionally ignores the production suite's `AUDIT_FIXTURES`. No live services
or accounts are used. Full runs should auto-seed fresh fixtures because the save
scenario changes the synthetic account's calendar. Use `AUDIT_BROWSER=webkit` or
`AUDIT_BROWSER=firefox` for the other installed Playwright engines. Reports and
screenshots are named by engine; `FOLLOWING_MONTH_CHECK_FILTER` selects a focused
scenario and writes a separate report without replacing the full run.

The desktop structure check seeds fresh disposable fixtures by default and owns
port 3192. Run `AUDIT_CHROME_CHANNEL=chrome npm run check:desktop-browser` locally;
`AUDIT_BROWSER=webkit` and `AUDIT_BROWSER=firefox` select the other engines. It
also accepts `DESKTOP_FIXTURES` for focused local reruns. It ignores the
production suite’s `AUDIT_FIXTURES`, whose sessions are deliberately revoked.

Run `AUDIT_DESKTOP=1 npm run check:following-month-browser` to exercise the five
calendar-data scenarios through the desktop toolbar. The mobile search-sheet
scenario remains mobile-only; desktop page navigation and Back are covered by
the desktop structure check. Desktop month reports have a `-desktop` suffix.
Do not overlap two runners on the same port or let two servers open one PGlite
directory. CI gates both desktop commands in addition to the mobile suite.

## Scale, accessibility, and visual audit

```sh
task_scale_fixture=$(DATABASE_URL= node --import tsx scripts/scale-audit-fixtures.ts | tail -n 1)
AUDIT_FIXTURES="$task_scale_fixture" AUDIT_MODE=accessibility node scripts/scale-visual-audit.mjs
AUDIT_FIXTURES="$task_scale_fixture" AUDIT_MODE=scale node scripts/scale-visual-audit.mjs
AUDIT_FIXTURES="$task_scale_fixture" AUDIT_MODE=visual node scripts/scale-visual-audit.mjs
```

This runner uses installed Chrome, reads the existing production build, and owns
port 3114 (override with `AUDIT_PORT`). It only reads synthetic application data,
so those fixtures can be reused across the three modes. Reports and screenshots
are written alongside the disposable database outside the repository. Fixture
manifests contain synthetic session credentials; do not upload them or server
logs as public artifacts.

Local PGlite timings describe workload shape and regressions, not production
PostgreSQL capacity, network latency, or physical-device battery and memory use.
The 200% text check doubles computed text sizes to stress fixed geometry; it is
not an OS Dynamic Type implementation. VoiceOver, external keyboards, swipe-back,
keyboard overlap, iPhone safe areas, background/resume, push delivery, email
delivery, and calendar-provider behavior still need the corresponding device or
integration environment.

## Legacy smoke scripts

Many older `scripts/*-smoke.mjs` files are historical scenario references, not
release gates. For example, `load-smoke.mjs` expects an old onboarding screen,
hardcodes a Linux browser path, and uses retired `/app` and `/week` surfaces;
`auth-smoke.mjs` still expects a removed coach/member toggle. Several depend on a
manually started server at port 3000 and an implicitly selected developer DB.

Do not run those scripts against a saved local or production database, and do not
count their presence as tested coverage. Port a missing scenario into the
maintained fixture-based runner before using it to approve a release. CI uploads
only the allowlisted JSON audit results, excluding fixture tokens, raw request
diagnostics, screenshots, and server logs.

## iPhone release readiness (2026-09-07)

See [the release audit](IPHONE_TESTFLIGHT_AUDIT_2026-09-07.md) and [iOS setup](ios-app.md). `npm run check:iphone-browser` exercises small/standard/large phone viewports, native header visibility, malformed sessions, private share reads, stalled route recovery, repeated Back taps and failed settings reads. It creates disposable fixtures and never targets production.

`npm run check:ios-release` checks the generated native production configuration and rejects unsafe variants. Run `npm run ios:sync` first. Xcode runs the same release gate automatically. `npm run check:production-environment` verifies that production rejects the development secret and a hosted embedded database despite development overrides.

The following-month transport fault harness disables service workers because worker-controlled WebKit requests bypass page interception. The ordinary production audit retains the worker and checks real offline/reconnect behavior.
