# Desktop performance and loading audit — September 9, 2026

The sweep found recoverable read failures that could leave loaders spinning, retain a rejected request, or show no response to a click. This change fixes those states and removes search/directory reads from the server-action queue.

## Changes

- Search and Discover now use authenticated, private, uncached JSON reads with a 14-second transport abort. A stalled query no longer holds up a different search, a filter change, or its retry. The existing server queries still enforce visibility, membership, and block rules.
- Shared account-scoped read memory now releases pending entries after 15 seconds. Late responses cannot overwrite a successful retry. Saves and other writes are not automatically retried.
- Fixed stuck month loading in studio calendars, with a retry that preserves the displayed month. Bounded notification pagination, Add composer, group class catalog, banner settings, and studio-admin reads.
- Added recoverable failures to profile schedule previews, personal plan details, search, Discover (including its sheet), class browsing, and share recipients. Cleared the share editor's failed composer promise so reopening can succeed. Handled background settings refresh rejection.
- Dancing dots now acknowledge navigation, class opening (including the deferred detail code), plan loading, banner loading/saving, Add, group catalog loading, and Following date refreshes. Group and management routes gain loading boundaries. Existing shared route/calendar dots remain in use. Both dot treatments respect reduced-motion settings.
- Disabled bulk profile/directory-link prefetching and deferred group creation code until needed. The first 12 Discover people/studio images load eagerly; images farther down remain lazy. Following already eagerly loads the first 16 faces.

## Verification

- Production build, type checking, lint, and shared cache regressions pass.
- Desktop navigation/layout audit passes at 940, 1024, 1440, and 1920 pixels, covering Calendar, Following, Discover, Search, profiles, studio/group administration, sharing, messages, notifications, settings, dropdowns, and Add.
- Seven new browser scenarios pass: animated/reduced-motion navigation dots, API authentication/input validation, a held search timing out and retrying before the old response is released, a newer search completing ahead of a held query, Discover failure recovery without bulk profile prefetch, Add recovery, and studio month recovery.
- Existing Following tests pass for distant months, offline retry, pagination, selected-date retention, delayed background responses, and saving. Notification tests pass for pagination, offline recovery, and cached content retention.
- Event browser tests pass for phone signup, email continuation in a fresh browser, waitlists, class QR links, private exports, iPad check-in, and accessibility. An initial contrast scan was transiently red; the repeat passed. The scanner now waits for font readiness and brings its page to the foreground, with element-level diagnostics retained for future failures.
- The new loading audit is included in the GitHub quality workflow. Loading boundaries can stream HTTP 200 before a not-found result; the anonymous group-admin check now verifies the streamed 404 signal and absence of management data as well.

## Local timing sample

Synthetic production build, disposable embedded database, three HTTP requests per route. The table shows the two warm responses. It does **not** measure production database latency, real network conditions, browser hydration, image decode, or Discover's later directory request. The first calendar response initialized the embedded database and took 845 ms. Before/after differences are noisy and do not establish a production speedup.

| Route | Warm full response | Response bytes |
| --- | ---: | ---: |
| `/calendar` | 68–76 ms | 104,042 |
| `/calendar/following` | 53–58 ms | 38,521 |
| `/discover` | 28–33 ms | 27,693 |
| `/coachshare` | 38–41 ms | 37,008 |
| `/inbox` | 34–34 ms | 24,770 |
| `/notifications` | 28–31 ms | 20,517 |
| `/settings` | 41–60 ms | 43,215 |
| `/admin` | 50–53 ms | 39,736 |
| `/auditcoach` | 64–67 ms | 55,192 |
| `/s/audit-studio` | 62–63 ms | 52,995 |
| `/g/audit-group` | 60–66 ms | 43,703 |

The fixture also verifies that a conversation with 2,000 older messages does not inflate the inbox payload and that legacy full-size profile photos do not replace available thumbnails. Raw timing and sanitized loading results are in the adjacent JSON report. No production accounts were changed and no email was sent by the audit.
