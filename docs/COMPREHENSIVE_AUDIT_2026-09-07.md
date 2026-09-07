# FittList comprehensive audit — September 7, 2026

The twelve-stage audit is complete, with fixes and remaining findings below. Stages ran in the requested order, with targeted retests as fixes landed. Test data is synthetic and disposable. Production accounts, database contents, email recipients, and provider configuration were not changed by these checks.

## Corrections made during the audit

- Search opened from You or Following now restores its sheet and query when Back returns from a result. Dismissing search clears that history entry without adding another Back step.
- Class edits retain existing class IDs for surviving weekdays and one-offs, preserving saves, group plans, discussions, and reactions. One-off date changes move associated occurrence dates in the same transaction.
- Scheduling rejects impossible dates and invalid times; retries recognize PostgreSQL conflict codes wrapped by the query library.
- Group, saved-calendar, profile, peek, share, and Following reads recheck class visibility and recurrence. Private attendance remains visible to its owner but is excluded from other viewers' calendars and mutual-attendance summaries.
- Stale favorites cannot grant access to private groups. Following a friend's activity cannot expose a blocked coach's class.
- Notification loading no longer marks undisplayed notifications read. Pagination retains timestamp precision and uses an ID tiebreaker; the page and sheet support older pages and retry failed loads. The unread badge rechecks remaining notifications.
- Failed database initialization closes its connection pool before the next attempt. Digest and daily-admin delivery counts only successful transport results. Push/mail failure logs omit raw provider errors, endpoints and recipient details.
- Profile contrast, segmented-control keyboard navigation, and loading foreground/background pairs were corrected.
- Mobile profile header and schedule gutters now match their container; enlarged action pills and time labels reflow. The main profile-photo components recover to initials when an image fails, including failures that finish before hydration.
- Directory schedule queries omit unused class artwork. Following mounts nearby date groups incrementally instead of an entire month. Month-date navigation realigns after deferred layouts settle, fixing a reproduced jump that landed far above the chosen date.

## Ordered stages

| Stage | Evidence and scope | Status |
| --- | --- | --- |
| 1. Native/iPhone | iOS 26.5 iPhone 17 Pro simulator build; welcome, icon, keyboard/search, profile actions, background/resume, and Back restoration inspected. Temporary local test configuration was restored afterward. | Simulator checks passed; physical device unavailable |
| 2. Data correctness | Nine actual-action scheduling cases, existing timezone/DST and atomicity checks. | Passed |
| 3. Multiple users/devices | Four concurrent-action/cache cases in isolated PGlite. | Passed locally; real PostgreSQL contention unverified |
| 4. Failure recovery | Five transaction/retry/cache recovery cases. | Passed |
| 5. Roles/privacy | Ten permission cases plus five grouped tests of actual saved-calendar loaders. | Passed |
| 6. Accessibility | Eleven axe-scanned routes; directory/group/studio arrow, Home and End keys; sheet focus containment, Escape and focus return; reduced-motion sampling. | Fifteen checks passed, zero axe violations |
| 7. Scale | 400 follows, 4,000 class definitions, 20 studios, 20 groups and 1,020 memberships; incremental scroll and month-date reachability. | Passed after fixes; future-month gap resolved in the follow-up below |
| 8. Notifications/integrations | Eight isolated grouped checks and four Chrome browser scenarios: 50→57 rows, unread acknowledgement, failed older-page/initial/cached refresh and retries, account isolation. | Passed with simulated delivery/outages |
| 9. Security/privacy | Three configuration/logging groups, unsubscribe contracts in stage 8, dependency registry and tracked-source checks; HTTP permissions also covered in the final browser suite. | Source checks passed; zero production dependency advisories, seven moderate development-tool entries |
| 10. Deployment/recovery | All 118 migrations apply and replay; disposable snapshot restores account/class/save relationships and migration history; failed transaction rollback and repeated failed pool cleanup. | Four grouped checks passed; provider recovery unverified |
| 11. Visual/content | 320/390/1440 px viewports, long/missing/portrait images, larger text, loading colors, main-photo fallback and overlay; representative screenshots inspected. | Twenty-four checks passed after fixes; title and tiny-preview limits below |
| 12. Coverage/CI | Production build, typecheck, lint, regressions and production-browser suites; checked-in quality workflow. | Passed on the final source; Chrome, WebKit and Firefox verified |

One combined final browser run timed out navigating in WebKit. A separate final-build WebKit/Firefox rerun passed; Chrome had already passed on that final build. The suite also corrected two new search-test selectors to match the actual URL and accessible Back label, and now waits for restored page content before continuing a Back-navigation loop. Build and lint error checks pass; existing non-blocking lint warnings remain.

## Scale measurements

- Directory schedule data: 66,650,948 → 2,570,948 serialized bytes, approximately 96% less. Weekly counts and each coach's next class remained identical. Measured query work was 155 → 53 ms in this fixture.
- Following after the same twelve scroll actions: 280,821 → 15,583 DOM nodes, approximately 94% less. Sampled heap was approximately 132 → 79 MB; this is a noisy desktop measurement, not an iPhone memory budget.
- The initial route samples completed in under one second locally. Those timings exclude real mobile/network/provider conditions.
- Incremental navigation exposed two then six day sections; choosing a populated date ten days ahead reached that heading and retained earlier dates.
- The maintained browser suite checked 15 routes and 42 internal links in each engine. Its throttled Chrome calendar sample was approximately 2.9 seconds at 4× CPU slowdown, 150 ms latency and 1.6 Mbps; this is a synthetic estimate, not a field measurement.

## Remaining findings and verification boundaries

1. **Resolved in the September 7 follow-up: Following's future-month gap.** Initial rendering still loads today/tomorrow and streams only through day 30. Browsing a later month now fetches its actual boundaries, at most 31 days per request, with a shared five-year UI/server horizon. Group occurrence membership travels with each window rather than stopping at 180 days. Loading and failure states are explicit; retry preserves the selected day, genuinely empty dates show their date heading, and day view can request more dates. Window merges retain previously loaded months and refreshed days reload before declaring themselves empty. Dedicated backend and browser checks are maintained in CI; details in [FOLLOWING_MONTH_FIX.md](./FOLLOWING_MONTH_FIX.md).
2. **Concurrent edits remain last-completed-write-wins.** Stable class identities preserve relationships, but the edit form has no revision precondition or stale-editor conflict prompt. Local tests do not replace a real multi-connection PostgreSQL contention test.
3. **Background delivery needs durable idempotency and retries.** Digests can repeat on job replay; overlapping shift-reminder jobs can race, and a failed email after notification creation is not automatically retried. Editing away a recurring weekday lacks the cancellation notice sent by explicit cancellation. Blob cleanup failures lack a durable retry queue.
4. **Provider and physical-device checks remain external.** Production backup/PITR retention and a provider restore, production rollback/alerting, actual email/push delivery, native push provisioning, physical VoiceOver/Dynamic Type, Face ID, swipe-back, and universal-link handoff were not verified. Native simulator loopback testing used temporary HTTP/cookie adaptation and is not evidence of production native transport security.
5. **Local performance is not production capacity.** Measurements use synthetic PGlite and desktop Chrome. The original large-image query exceeded PGlite's result buffer; its benchmark baseline was read in batches. Heap samples are approximate and retain the complete loaded calendar data even when fewer cards are mounted.
6. **Development dependency advisories remain.** `npm audit --omit=dev --json` reported zero vulnerabilities. The full audit reported seven moderate package entries across two transitive advisory chains: esbuild through drizzle-kit and uuid through the Capacitor CLI's xcode dependency. npm proposes tooling version changes that are not a safe automatic release fix. These need a separate compatibility-tested tooling update; no high or critical advisory was reported.
7. **Some visual edge cases remain.** Tiny directory and member-preview images still use raw image elements and may show a broken-image glyph for failed URLs. Main profile and photo-overlay fallbacks are covered by this audit. At 200% text stress, the fixed profile-title slot truncates more text; controls remain available, but the full title needs a separate large-text design review. Automated axe and reflow checks do not certify full accessibility compliance.
8. **Schedule-card alignment is not yet uniform.** Screenshot review shows studio/group schedule cards still place the class name on the left and time on the right; coach profiles use time on the left. Geometry checks pass, but these surfaces need a shared card-layout pass to fully match the requested You calendar styling.

## Repeating the checks

See [TESTING.md](./TESTING.md) for maintained commands and safe fixture handling, [the sanitized results](./COMPREHENSIVE_AUDIT_2026-09-07.json) for machine-readable evidence, and [OPERATIONS_RUNBOOK.md](./OPERATIONS_RUNBOOK.md) for deployment, backup and recovery procedures. Historical smoke scripts are not counted as release coverage. The quality workflow does not by itself enable GitHub branch protection or a deployment approval gate.
