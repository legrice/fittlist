# Desktop audit — September 7, 2026

**Implemented direction: restore main’s desktop page structure and refresh its styling.**
Use the left navigation to organize the application, open calendars directly,
and give desktop its own presentation rules. Keep the working branch’s account,
calendar-loading, privacy, scheduling, and accessibility fixes.

[View the restored desktop](./desktop-restoration-2026-09-07/index.html) ·
[Original main/branch comparison](./desktop-audit-2026-09-07/index.html).

## What was compared

- Main: `bd60b5d7` — Remove photos from classes.
- Working branch: `a6e8f8b3` — Align profile schedule cards around a shared time gutter.
- Both production builds ran locally with copies of the same synthetic database.
  Main’s older runtime uses `.data/pglite`; its comparison used that path in an
  isolated checkout. No production accounts or services were used.
- 66 captured states across the personal calendar, Following, directory tabs,
  private/public profiles, studios, groups, studio admin/calendar, messages,
  notifications, settings, and Share. Main’s Following equivalent is `/feed`.
- Main route comparisons at 1440×900; key screens also at 1024×768 and
  1920×1080, plus the 939/940px transition. Additional captures examine Share,
  personal-calendar, notification, and profile-edit entry points.
- Screenshot review, rendered geometry, pointer interaction, and source comparison.
  This is a desktop design/interaction audit, not a new full regression or
  accessibility certification. These comparisons show the original audit,
  before the desktop restoration described below.

## Findings

### 1. Calendar entry is now an action hub — high priority

Main opens `/calendar` into a titled schedule with view controls. The branch
opens a large summary and an action surface with a drag handle. The schedule
requires another click. Following similarly opens its directory before its
calendar. On desktop, this duplicates Profile, Share, Messages, Notifications,
and managed calendars already available through the left navigation.

Restore direct schedule entry on desktop. Place the calendar title, month/day
controls, filters, and Add action above the schedule. Keep the mobile reveal
interaction scoped to mobile presentation.

Sources: `CalendarScreen.tsx`, `FollowingScreen.tsx`, and the unscoped
`.calendar-action-sheet` / `.calendar-scope-*` rules in `globals.css`.

### 2. Profile identity and actions regress on desktop — high priority

The branch’s public studio profile has a white title but its new
`.profile-seam-top` container measures **0×0** at desktop width. The title’s
dark background therefore never occupies its intended space. Main displays
the studio name clearly.

On the public person profile, clicking **More profile actions** fails because
`.pubidentity.pubidentity-paper` intercepts the pointer. The same action opens
normally on main. This makes the profile problem functional as well as visual.

Restore an explicit desktop identity header with a readable name and reachable
Back/overflow controls. Apply the dark green header inside a properly sized
desktop layout. Retain circular photos and compact Following/Contact/About
actions. Public profiles and studio administration remain separate destinations.

Sources: `ProfileTabs.tsx`, the mobile-only `.profile-seam-top` geometry near
`globals.css:4983`, and the global profile palette/title overrides near
`globals.css:15424`.

### 3. The left navigation disappears at small desktop widths — high priority

Both versions hide `.desktop-left` until **1100px**. At 940px and 1024px the
captured calendar has no persistent desktop rail. Main also has this gap, so
restoring its layout alone would preserve the problem.

Choose one desktop breakpoint and keep navigation available throughout the
desktop range. A narrower, collapsible rail is appropriate for smaller windows.
Verify the transition itself as well as common laptop widths.

Sources: `DesktopChrome.tsx`, `globals.css:10024`, and the separate 940px
navigation/layout rules.

### 4. Calendar selection and terminology disagree — high priority

The branch’s left calendar menu marks **My week** and **Personal calendar** as
selected at the same time. Meanwhile, the content uses **You / Explore**. Main’s
desktop navigation component is unchanged, but its route assumptions no longer
match the branch’s calendar URLs.

Give the left navigation explicit destinations for **Your calendar** and
**Following**, with one selected destination. Put managed studio and group
calendars beneath their appropriate scope. Remove the competing top-level
calendar switcher from desktop pages.

Sources: `DesktopChrome.tsx:78`, its menu selection predicates, and
`lib/nav.ts:45`.

### 5. Desktop overlays need a presentation policy — high priority

The branch’s Search is a **480×801px** panel at 1440×900, with a phone-style
grab handle and substantial empty vertical space. Opening the personal calendar
from Profile covers the entire **1440×900px** viewport, including the left
navigation. Calendar Share also takes over the full viewport.

The personal-calendar and Share takeovers already exist on main. They need a
desktop behavior change even when main supplies the page layout. Main’s small
Add and class-detail dialogs, however, already center themselves and size to
their content; that remains a useful pattern.

| Workflow | Desktop treatment |
| --- | --- |
| Calendar, Following, Search/Discover, Messages, Notifications, Settings | Normal workspace pages reached through the left navigation or a page link |
| Share editor | The existing full Share page with the left rail retained |
| Class details and short editing tasks | A content-sized centered dialog or a detail panel within the workspace |
| Filters and overflow actions | An anchored menu/popover near the trigger |
| Destructive confirmations | A deliberate modal dialog with focus containment |

Remove desktop grab handles, top/bottom sliding presentation, and full-viewport
calendar takeovers. Keep Escape, correct focus restoration, and background
isolation for true modal dialogs. A nonmodal detail panel must have different
focus/navigation behavior from a modal.

Sources: `PersonalCalendarSheet.tsx`, `ShareTakeover.tsx`, `SiteSearchSheet.tsx`,
`NotificationsSheet.tsx`, `SettingsDetailSheet.tsx`, `ScrollLock.tsx`, and their
desktop CSS.

### 6. Desktop still mixes old and new styling — medium priority

Studio/group schedule cards keep the legacy colored vertical rails and divider
rows on desktop, while mobile uses the newer card treatment. The left Add button
and parts of Share also use the older lime signal alongside the newer green.
The branch’s studio admin workspace becomes an all-dark page while adjacent
workspaces remain light.

Use the current palette consistently: dark green for navigation/header emphasis,
light gray workspace, white content surfaces, and one green primary action.
Remove the occurrence color rails. Retain the newer time-on-left alignment,
single-line titles, and coach attribution. Use dark active Following buttons.
Keep the labels **Teaching** and **Admin** across desktop routes and inspectors.

Main contains the older row coloring too; it supplies the layout baseline rather
than the finished visual treatment.

### 7. Desktop spacing needs a separate pass — medium priority

At 1440px, the branch’s public studio schedule begins around 560px down the
page. Main starts its schedule around 450px. The branch adds broad action pills,
a member-preview row, and large segmented controls before the first class.
Its studio admin page uses a tall single-column menu that could be organized
through the persistent rail. At 1920px, long controls and rows amplify this.

Use a compact identity header, a bounded reading width, and an explicit studio
admin subsection in the left navigation. Preserve space for real schedule data.
Main itself produced horizontal overflow on the 1920px studio-profile sample;
carry forward the branch’s overflow/reflow corrections.

## Proposed restoration sequence

1. Repair desktop profile identity/actions and reconcile navigation breakpoints
   and selected states.
2. Restore main’s direct personal/Following calendar composition at desktop
   widths, using the current loaders and data contracts.
3. Route desktop calendar, Search, Notifications, Settings, and Share entry
   points into workspace pages. Apply separate rules to dialogs and popovers.
4. Unify the desktop palette, cards, typography, control sizes, and admin density.
5. Verify desktop at 940/1024/1280/1440/1920px and mobile at 390px. Check keyboard
   access, history/back restoration, profile actions, modal dismissal, calendar
   month loading, and the existing privacy/scheduling regressions.

The implementation should retain the current shared data/actions, first-teaching
transaction behavior, future-month loading, visibility checks, and navigation/
focus fixes. Presentation can be restored selectively without reverting those
changes or touching native configuration.

## Original audit status

The original audit and visual comparisons preceded the implementation below.
That audit alone changed no application code. Screenshots contain synthetic
fixture data only; fixture credentials and server logs are excluded from the
report.


## Desktop restoration

The working branch now opens Your calendar and Following directly at desktop
widths. The existing page toolbar, view filter, and day/month controls return.
Both calendar structures are present in the server render: a delayed background
calendar request must not hide the desktop toolbar. Mobile retains its action
surface, reveal gesture, and separate schedule presentation below 940px.

The left rail begins at 940px (240px wide) and expands to 280px at 1100px. It
organizes Calendar, Following, Search, Discover, Share, Messages, Notifications,
Add, and Profile. Managed calendars expand inside that rail. Personal and
Following selections no longer overlap. Personal-calendar, Share, Search and
Notifications entry points use their existing pages on desktop, including a
repaired desktop frame for the Notifications route.

The styling uses the current dark green, light gray canvas, white cards, green
primary actions, and dark selected controls. Person, studio and group names
have a real dark header area, two-line limits and reachable corner actions.
Calendar cards retain the shared time gutter, truncated title and attribution.
Colored row rails are removed. Profile section tabs use the compact desktop
row, and studio admin returns to a light workspace with a dark identity header.
Short tasks use centered, rounded dialogs with the existing focus and Escape
handling. Profile About expands in the desktop page.

No account migration, permission change, production deployment, main merge or
native release is part of this restoration. The first-public-teaching
transaction and the future-month/visibility fixes remain in place.

Verification is recorded with the implementation commit. Reproduce desktop
checks with `npm run check:desktop-browser` and
`AUDIT_DESKTOP=1 npm run check:following-month-browser`; see [TESTING.md](./TESTING.md).


### Verification of the restoration

- Production build, typecheck, lint and production regressions passed.
- Data integrity, saved visibility and calendar window checks passed, including
  first teaching without an account switch and failed-publish rollback.
- Chrome production audit passed: 15 routes, 38 links, origin-aware Back,
  repeated dismissals, focus, offline/reconnect, accessibility, authentication,
  signup and server-action permission checks.
- Desktop browser regression passed in Chrome at 940, 1024, 1440 and 1920px,
  including route entry, calendar views, profile actions, keyboard dismissal,
  the scrolled month toolbar, managed-calendar navigation, and page/Back flows.
- The same desktop matrix and workflows passed in WebKit with no runtime errors.
  Its route crawl verifies the Share PNG finishes before unloading the page;
  app-driven Share/Back navigation is exercised separately.
- All six mobile Following month scenarios and all five desktop calendar-data
  scenarios passed in Chrome. The delayed-response test identifies the actual
  calendar remainder action, rather than another background request.
- 33 visual states were captured with no page overflow or pointer errors.
  The [restored desktop gallery](./desktop-restoration-2026-09-07/index.html)
  contains six representative captures from the isolated production build.
- The retired hidden right-sidebar fetch and desktop mobile-share preload were
  removed. The Add trigger retains focus while composer data loads.

CI now runs the desktop structure audit and desktop future-month checks in
addition to its existing mobile and data-integrity gates. Local browser audit
builds must compile `NEXT_PUBLIC_ORIGIN=http://localhost:3100` so the signup flow
returns to the correct test server; this setting was verified with a complete
production browser rerun.
