# Navigation and sheet audit — September 7, 2026

Explore copy is unchanged. Tested an optimized local production build with disposable PGlite data and installed Chrome, at mobile and desktop sizes.

## Fixes

- Following directory, feedback, followers, requests, blocked accounts, ethos and brand back controls now return through navigation history, using Calendar only for a direct-entry fallback.
- Shared sheet keyboard handling refreshes the active dialog before processing Tab, preventing focus from escaping during the first frame after opening.
- Escape uses the top sheet’s existing enabled close control. It stops propagation so underlying sheets do not also close.
- Browser regressions now follow the current Explore labels and group overflow flow, support installed Chrome, and use reduced motion for stable accessibility measurements instead of waiting indefinitely on page animations.

## Verification

- Production build passed, including copy, colors, typography, icons, native navigation, share performance, content safety, time zones/DST, calendar atomicity, purge, rate limits and email confirmation checks.
- ESLint error check and production regression suite passed. The build still reports existing non-blocking hook-dependency and unused suppression warnings; this pass does not claim a warning-free codebase.
- 15 key routes and 42 discovered internal links returned successful responses. Repeated Back checks from You, Explore and Support returned to their origin.
- Profile/group sheets passed repeated open/close, keyboard focus, Escape and stable browser-history checks. Close targets are at least 44px. Group settings and class catalog were exercised at 390px and 1280px; representative sheet screenshots visually match the shared styling.
- Browser flows passed: mobile/desktop calendar, back/forward, refresh, deep links, profiles, studios, discovery, settings, search, adder, offline/reconnect, password login/logout, email-link signup, onboarding and profile editing.
- Tested calendar screen: zero automated WCAG A/AA violations and zero unexplained JavaScript errors.
- Security checks passed for cross-account access, private exports, blocks, occurrence validation, idempotent saves, CSRF rejection, login limits and password-change session revocation.

## Performance and limits

Calendar navigation ready: **2.84 seconds** with 4× CPU slowdown, 150ms latency and 1.6 Mbps download. Local initial navigation: TTFB 50ms, DOM ready 58ms; no observed layout shift or long tasks in that sample. LCP was not observed and remains null. These are smoke measurements, not production percentiles or a claim about physical iPhone performance.

Native navigation contracts passed, but physical iOS, Safari/WebKit and Firefox were not rerun in this pass. Link coverage is the internal links exposed by the tested fixtures; external websites and every conditional account state are outside this run. Existing native edits were preserved separately.

Machine-readable results: [navigation-audit-2026-09-07.json](navigation-audit-2026-09-07.json).

To repeat with fresh local data:

```sh
DATABASE_URL='' node --import tsx scripts/audit-fixtures.ts
AUDIT_FIXTURES=/path/printed/above/fixtures.json AUDIT_BROWSERS=chromium AUDIT_CHROME_CHANNEL=chrome npm run test:browser
```
