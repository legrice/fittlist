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
npm run build
npx playwright install chromium
task_fixture_path=$(DATABASE_URL= node --import tsx scripts/audit-fixtures.ts | tail -n 1)
AUDIT_FIXTURES="$task_fixture_path" AUDIT_BROWSERS=chromium npm run test:browser
```

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
