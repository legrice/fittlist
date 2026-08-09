# FittList — Home screen

Build spec for the new Home tab. Reference prototype: `fittlist-home-wireframe.html`.

## Why

Today the app opens on Following, a list of classes from coaches you follow. Once you've
followed a few people it stops changing, so the app feels dead on the second visit. Home
replaces it as the landing tab: a mixed scroll that has something new on it whether or not
your follow graph changed.

Following stays as its own tab. Home does not replace it.

## Navigation

Five tabs: **Home · Following · Search · Schedule · You**

- Home is new and is the default landing tab.
- The current Discover tab is renamed **Search**. Same directory, no functional change
  required for v1. The rename exists because Home and Discover both read as "find stuff"
  and people won't know which to open. Home is curated, Search is intent.
- Remove the magnifying glass from the app header, since Search is now a tab.
- Following, Schedule, and You are unchanged.
- Active tab: the icon sits on a light orange rounded background (Sienna at ~18% opacity,
  11px radius, roughly 46x32). The icon stroke color does not change, and the label is not
  shaded. This replaces the earlier white pill behind the whole tab.

## Content types and color

Five types, each with a fixed color used on the left spine of cards, on directory filter
chips, and on the schedule spine. A color always means the same kind of thing.

| Type | Color | Token |
|---|---|---|
| Class | Sienna | `#DD583A` |
| Event | Tacha | `#CBD665` |
| Club | Sky | `#92A6A7` |
| Coach | Gold | `#B08A2E` |
| Studio | Olive | `#6B7A3A` |

Events and clubs are not built yet. Ship Home with classes, coaches, and studios, and leave
the sections stubbed behind a flag.

## Sections, in order

Header row above everything: location chip (`Jersey City ▾`) and today's date.

### 1. Upcoming
**Only classes the signed-in user has marked as going.** Horizontal rail, 7 day window,
chronological. Day-labeled pills: Today, Tomorrow, then weekday name.

Each card shows: time pill, class name, coach avatar and name, studio, distance, duration,
and a going row (`Erin and 2 others going`) listing people the user follows who are also
going. Omit the going row when nobody the user follows is attending.

"Schedule →" in the section header links to the Schedule tab filtered to Going.

Empty state (the common state for a new account): dashed card, "Nothing planned yet",
"Mark a class as going and it shows up here", and a **Find a class** button routing to
Search.

Recommended classes get mixed into this rail later. Not in v1.

### 2. Events *(flagged off)*
Horizontal rail of image-led cards with a date chip. Workshops, expos, one-off outdoor
sessions. Card shows kicker (Workshop / Free · Outdoors / Expo), title, day, time, venue,
price.

### 3. Clubs near you *(flagged off)*
Horizontal rail. Card shows club type kicker, name, next meetup day, time and place, and
member count with a small avatar stack. A club is recurring, so lead with "next meetup",
not a date.

### 4. People near you
Avatar rail. Mixes coaches and members, since members are followable too and a coach
wanting to attend a workout is a real use case.

- Coach: `Coach · 4 classes`
- Member: `Goes to Alpha Fit`

Inline Follow button on each. This is the section that feeds the follow graph, so keep the
follow action one tap and don't navigate away on tap.

### 5. Studios
Vertical list, three rows plus "All →". Row shows initial tile, name, address, and a stat.

Two states, driven by the existing verified flow:

- **Verified** — green `✓ Verified` badge next to the name, stat reads
  `9 coaches · 31 classes/wk`, primary action is **Follow**.
- **Unverified / community-managed** — no badge, stat reads `added by 6 coaches`,
  secondary action is **View**, not Follow.

Unverified pages have no owner committing to keep them current, so don't offer a follow
that promises updates. The Follow button appearing on claim is a concrete thing a studio
owner gains by verifying.

### 6. Activity
Vertical list at the bottom of the scroll. This is the reason to follow members, and it's
also the thing that changes most often once the graph exists.

**Coach schedule posts are the most important row type here.** Coaches post on a weekly
rhythm, so this is the only content in the app that regenerates without an algorithm and
without growth in the follow graph. It's also the literal reason someone opens the app: did
my coach put up next week yet.

Event kinds to render:
- `{coach} posted next week` — class count and the studios involved
- `{coach} added N classes` — flag a studio the coach hasn't taught at before, since that's
  the interesting part
- `{person} is going to {class}` — day, time, studio, and `with N others` when applicable
- `{person} went to {class}` — studio, relative day
- `{person} joined {club}` — meeting day, time, place *(flagged off with clubs)*

Ordering: coach posts first, then attendance. Collapse multiple posts by the same coach
within a window into one row so a coach entering a full month doesn't take over the feed.

Rows tap through to the coach's schedule or the class.

"Following →" in the header links to the Following tab.

Footer line under the section: *Only public actions appear here. Anything marked Personal
stays private.*

## Privacy rule

This is the one rule the whole social layer depends on. The Schedule tab already has the
right line drawn:

- **Teaching** — public. A coach's classes are public and associate with the studio page.
- **Going** — public by default. Appears in Activity, in other people's going rows, and in
  attendee counts.
- **Personal** — never public. Never appears in Activity, never in a going row, never in a
  count. Member-added classes default here.

Going has to default to public or Activity is empty and none of this works, but the
visibility toggle must be visible at the moment a user marks going, not buried in settings.

## Out of scope

- **No booking layer.** Studios run their own booking systems. Do not render spots,
  availability, capacity, waitlists, or prices on class cards. Booking links stay where they
  already live, on the class detail.
- No algorithmic ranking. Upcoming is chronological. People and studios can be ordered by
  proximity, then by recency of activity.
- No infinite scroll. Home is a finite page that ends.

## Notes for implementation

- Every rail is horizontally scrollable with snap, no visible scrollbar, 20px page gutter
  that the rail bleeds into so cards peek at the edge.
- Every section header has a "see all" affordance that routes somewhere real. Don't ship a
  section whose overflow has nowhere to go.
- Sections with no content are removed entirely, not shown empty. The one exception is
  Upcoming, which has a designed empty state because it's the user's own list and its
  emptiness is actionable.

## Prototype toggles

The reference HTML has three controls above the phone frame. They are prototype scaffolding,
not product features:

- **Layout A / B** — A is time-first (ship this). B adds a category tile grid on top, which
  front-loads a directory and reintroduces the deadness problem.
- **Scope Today / + Events & clubs** — shows Home with only the content types that exist
  today versus the full version.
- **Upcoming Has plans / Empty** — the two states of section 1.
