# Explore performance audit

## What was slowing the first screen down

Explore used to build Coaches, Classes, and Studios on every visit, even
though only Coaches was visible. Opening the default tab caused the server to:

1. Load every discoverable user and every studio.
2. Load follows, pending requests, and the viewer's class saves.
3. Load every public coach schedule, standing shift, and applicable cover.
4. Load gym-owned classes.
5. Expand recurring classes across the discovery window.
6. Send all three directories to the browser before the first useful screen.

That made the hidden Classes tab part of the critical path for Coaches. On a
mobile connection, the user paid for the largest query and payload before
seeing the smallest view.

## Changes in this pass

- Each tab is now a route-backed view that fetches only its own data.
- Coaches no longer expands schedules merely to calculate an unused count.
- Studios loads studios only.
- Classes keeps the schedule expansion, but only after the Classes tab is
  explicitly opened.
- Automatic prefetch is disabled for the expensive hidden tabs. A tap still
  navigates normally and immediately shows the route loading shell.
- The class agenda is a separate client chunk and is absent from the initial
  Coaches JavaScript.
- Only the first four directory images load eagerly; the rest use native lazy
  loading and asynchronous decoding.
- A route-level skeleton paints the complete above-the-fold layout while the
  active query is running, preventing a blank screen and layout shift.

## Expected request shape

| View | Before | After |
| --- | --- | --- |
| Coaches | Users, follows, requests, saves, studios, all schedules, shifts, covers, gym classes | Users, hidden accounts, follows, requests |
| Studios | Same full payload | Studios |
| Classes | Same full payload | Users, hidden accounts, saves, studios, schedules, gym classes |

## Next measurements

Capture real production timings for server response, rendered content, query
duration, and response bytes on each Explore route. If Classes remains slow,
the next step is a bounded occurrence query or cursor pagination rather than
another client-side loading treatment. The database should return only the
first visible date window and fetch later dates as the user approaches them.

The goal is not merely a faster spinner. The default Explore route should do
less work, send less data, and show its first useful people immediately.
