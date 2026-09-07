# Following future-month fix — September 7, 2026

Following offered twelve months while its server stopped at day 30, its day list
stopped at day 180, and its group membership keys also stopped at day 180. Later
classes could therefore look missing.

The initial response still contains today and tomorrow, followed by days 2–30.
Visible months now request their exact calendar boundaries, with at most 31 days
expanded per request. The UI and server share a five-year maximum horizon. Each
occurrence carries its authorized group memberships for that window, including
classes whose teacher is not directly followed.

Unloaded months show the existing loading dots. Failed months offer retry and
retain the intended date. A loaded empty date opens its own date heading with an
empty message; Following's dates say “Open” rather than promising to add an entry.
The day list can request more dates, and skipped, unloaded intervals offer “Load
earlier dates.” Existing incremental card rendering remains in place.

Responses are merged by occurrence and date window. A late initial response
cannot erase a loaded future month. Server refreshes reset month data and fetch
again, so cached windows cannot preserve canceled classes or revoked group
access. A selected future day reloads before declaring itself empty. Shared
in-flight remainder requests are invalidated when the server seed changes.

## Verification

- Production build, TypeScript, lint and core regression suite pass.
- The data-integrity suite includes actual month actions: month boundaries, leap
  years, bounded ranges, invalid inputs, first/last/recurring occurrences, group
  membership, blocked/private/canceled/ended exclusion, and account isolation.
- Six dedicated browser scenarios pass in Chromium (installed Chrome), WebKit,
  and Firefox. They exercise dates two and eight months ahead, dated and recurring
  classes, group-only classes, genuinely empty dates, deduplication, offline
  failure/retry preserving the selected date, day-list continuation, retained
  loaded data, saving a future class, and search-close refresh preserving its
  selected date and class. Future-month and selected-day screenshots were also
  inspected; the date heading and first coach row remain clear of the toolbar.
- An unchanged search-close refresh can retain identical server props and does
  not necessarily issue another month request. The browser check requires the
  selected date and class to remain visible; it records any refetch as observed.
- The delayed-remainder browser scenario verifies retained data after completion.
  Next queues server actions serially in this setup, so that scenario does not
  exercise reversed network completion order. The window merge and generation
  guards provide the source-level protection for that ordering.

These checks use isolated synthetic PGlite databases and local browsers; they
make no changes to production accounts or services. The backend and browser
regressions are included in the GitHub quality workflow. See [TESTING.md](./TESTING.md)
for commands and fixture handling.
