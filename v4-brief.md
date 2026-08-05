# FittList — build brief

Reference prototype: `design/fittlist-prototype-v4.html`. Open it in a browser. The grey bar
above the phone is scaffolding for reviewing, not part of the app: persona switcher
(John = member, Matt = coach, Tom = schedule-only coach) and a "Start empty" button
that clears follows and saves so you can see the empty state.

This brief describes what to build. Where the brief and the prototype disagree, the
brief wins.

---

## 1. The model

One object, one action, three relationships.

**A class occurrence** is a real class at a real place at a real time. Who typed it
into FittList is a byline, not a category. A member-added class and a coach-added
class are the same record with a different creator.

**Saving** is the only action. It means intent to go, not a booking. Saving is per
occurrence, not per series.

**Relationships to an occurrence**, which drive every colour and label in the app:

| Key | Label | Meaning |
|---|---|---|
| `coaching` | Coaching | You teach it |
| `saved` | Saved | You saved it to your week |
| `yours` | Added by me | You created the record |
| `personal` | Personal | Private session, only you see it |
| `following` | From coaches I follow | Everything else on your schedule |

**Your week** = everything you're coaching plus everything you've saved. It's the
input to the share image and the thing the You tab summarises.

---

## 2. Colour system

Five tokens plus a tinted background for each. Used by filter chips, card accent
bars, month chips, You tab pills, and share composer labels. Nothing else in the app
should introduce a new semantic colour.

```css
--coaching:  #C4532B;  --coaching-bg:  #F7E3DA;
--saved:     #3E6B8A;  --saved-bg:     #DFE9F0;
--yours:     #4E6B4A;  --yours-bg:     #E1EADE;
--personal:  #6B6470;  --personal-bg:  #E7E3EA;
--following: #8A7A3C;  --following-bg: #EFE8D6;
```

Base palette: `--ink #141310`, `--sienna #C4532B`, `--cream #FAF7F0`,
`--card #FFFFFF`, `--muted #7C776C`, `--line #E8E3D6`, `--soft #F1EDE2`.

---

## 3. Navigation

Three tabs: **Schedule**, **Discover**, **You**. Schedule is home.

Discover disappears from the tab bar entirely when a user has discovery switched off
(see section 8).

---

## 4. Schedule

The app header (logo, BETA chip, bell) scrolls away with the content. The controls
block below it is sticky: title, list/month toggle, Filter, day pills, and any active
filter chips. When pinned it gets a hairline and a soft shadow.

**Day pills** start at today and run a week forward. Past days are not shown. Only
today carries a dot, sienna, flipping to cream when that pill is selected. No other
dots.

**Filter** is a worded pill, not an icon, with a sienna count badge when active. It
opens a multiselect sheet listing the five relationship types with colour swatches
and checkboxes. The confirm button previews the result count. Selected filters render
as removable colour chips inside the sticky block, plus a Clear.

**Month view** shows coloured chips per day, two visible plus a `+n`, and a sienna
circle on today. Tapping a day switches to list view on that day. The key at the
bottom doubles as filter toggles.

**Cards**: avatar (circle for a coach, rounded square for a venue when there's no
coach), name line, class title, `time · length · venue`. Accent bar on the left in
the relationship colour, except for `following`. Top right holds exactly one thing:
a bookmark for saveable classes, or a Coaching / Personal chip. Never both, and never
a stacked icon-and-label.

**Floating controls**: share pill bottom left reading "Your week", Add bottom right.
When sharing is off, the share pill is hidden and the row switches to right-aligned
so Add stays in the same place.

**Empty state**, and it differs by role:

- **Members** get two cards. Add a class first, Follow a coach second. Add comes first
  because it always succeeds, whereas following depends on the right coach existing in
  the catalog.
- **Coaches** get one card, Add a class, and nothing about following. A coach with an
  empty schedule has exactly one job, and it isn't discovery. Copy leans on what the
  class feeds: "Add the classes you coach. They fill your schedule, your profile and
  the week you share."
- Coaches with discovery off also get a line explaining their studio fills the rest.

---

## 5. Class page

Order: sticky header, hero, category eyebrow, title, about text (no "About"
heading, truncated around 150 characters with a More link), coach or creator credit,
date, venue, save, booking, disclaimer.

**Sticky header**: back, share, overflow. Floats over the photo with a shadow, then
fills with cream and fades the class name in beside the back button on scroll.

**Overflow** splits by ownership:
- Everyone: Add to Google Calendar, Add to Apple or Outlook, Share as an image
- Owner: Edit class, Change the photo, Duplicate to another day, Cancel or Delete
- Others: Suggest an edit, Report a problem

**No saved-by section.** Members do not see who saved a class. This is deliberate and
comes back later, not now.

**Booking** carries provenance. Anyone can add a link. Coach links show "From the
coach" and sit at the top; member links show "Added by a member" and sit below under
an "Also suggested" divider.

**Disclaimer** closes every non-personal class page, centred and quiet:

> **FittList isn't a booking system.** Class details are posted by coaches and members
> and may not match the studio's schedule. Times change, classes get cancelled. Check
> with {venue} before you go. **Something wrong?**

"Something wrong?" opens a report sheet with concrete reasons: time or day is wrong,
cancelled, no longer runs, wrong studio or address, broken booking link, something
else. These map to fixes and tell you which listings are rotting.

---

## 6. Discover

Coaches only. Members, classes and studios are removed for now. Title reads
"Discover", search placeholder reads "Search coaches", category pills sit under the
search bar.

**Follow is outlined. Following is filled black.** Note this inverts the usual
convention deliberately: it reads as a selection state.

**On follow**, the full chain fires:
1. Toast: "You followed **{coach}**. {n} classes on your schedule."
2. Switch to the Schedule tab, scroll to the first day they teach
3. Their cards hold a warm yellow (`#FBEFB8`) for 3 seconds, then fade to white

**Gate the jump.** Do it only when the schedule was empty before the follow, or only
on the first follow of a session. Otherwise someone working down the Discover list
gets yanked out of it on every tap. On subsequent follows, fire the toast only and
give it a "See your schedule" action instead.

---

## 7. You

Order: profile, stats, **Your week**, **Your reach**, Your studios, and a note if
everything is switched off.

Settings live behind the gear icon, not in a list on the page.

**Your week** shows up to five upcoming items with relationship pills, plus a Share
your week button. Hidden entirely when sharing is off.

**Your reach** (coaches only, hideable):
- Opens leads, at large size, because it's the only feedback a coach gets on the
  share image and currently they get none
- Then saves all time, profile views, followers
- Share next week closes the card
- The ··· in the header opens a definitions sheet with "Hide reach from my profile"

**Never show coaches who saved.** Counts only. The definitions sheet says so
explicitly, and that line should survive into later versions.

**Zeros**: suppress the per-class save line entirely at zero rather than rendering
"0 saved". Keep reach figures cumulative rather than weekly until a typical coach
clears roughly five saves a week, then switch to weekly with a trend.

---

## 8. Schedule-only mode

The Tom case. A coach onboarded top-down by their studio's shift tracking, who wants
a schedule and nothing else.

Settings opens with **What FittList does for you**, two presets:
- **Just my schedule** — your classes and shifts, nothing else
- **Everything** — follow coaches, share your week, see how it lands

Under them, three individual switches: Discover, Sharing, Your reach. A preset sets
all three; changing one alone flips the label to Custom.

What each switch controls:
- **Discover off** — the tab disappears from the nav; the empty state loses the follow
  card; the Following stat stops linking
- **Sharing off** — no share pill on Schedule, no Your week section on You, no share
  icon on the profile, no Share your week action in the save toast, no Share next week
  on the reach card
- **Reach off** — no reach card, and no per-class save line on the coach's own classes

When all three are off, the You tab shows a quiet note saying so with a way back into
settings. The mode must never be a trapdoor.

**Recommendation**: when a studio invites a coach onto shift tracking, land them in
schedule-only by default and let them opt into the rest. Top-down installs didn't ask
for a social product.

---

## 9. The adder

The most important surface in the app. Two taps for a class that already exists.

**One screen, not a wizard.** Opens on a venue and a day as editable chips in the
header, defaulting to the user's usual studio and the currently selected day. Below
that, a search field and that day's schedule at that venue.

**Three match states**:
- No query: the day's full schedule, sorted by time
- Strong match: an "Already on FittList" section at the top, tinted, tap to save
- Weak match: a "Did you mean" section below it

The create button is always visible at the bottom carrying the typed name, so a miss
never dead-ends.

**Create screen fields**:
- Class name
- Start time as chips, not a text input, since class times cluster hard
- Length as chips
- "I'm coaching this" (coaches only) — puts it on their public calendar
- "List it publicly" — off means a private personal session with no save list

**Server-side rule**: on save, match on venue + start time within 20 minutes at the
same place and attach rather than create, even if the user skipped the suggestion.

The same adder component is used in three places: the Add button on Schedule, the
empty state, and inside the share composer.

---

## 10. Share composer

Match the existing shipped design. **No Coaching / Going toggle** — the composer
takes your week as one thing, and the checkboxes handle exclusions.

Layout: "Share your schedule" with an X, then

- **Classes** · what goes on your image → a card reading "All N showing" over the date
  range, with an Edit link
- **Style** · colours for your image → a select with a colour dot
- **Show my photo** → a switch
- The poster preview
- **Save image** and **Share image** side by side, Save outlined on the left, Share
  filled on the right

**Edit** opens "Classes on your image": the date range as a subtitle, each class as a
row with a sienna checkbox, a dashed "+ Add a class" button that opens the adder, the
helper text, and Done.

> Unchecking hides a class from the image. It stays on your calendar. Anything you add
> here is added to your calendar too.

**Two open questions** I did not invent answers for:
1. Nothing in the current screenshots sets the date range. If the start-date and
   number-of-days control still exists, it probably belongs in the Edit sheet under the
   title, where the range is already stated.
2. No headline editor appears either. "COME TRAIN WITH ME" is hardcoded in the
   prototype. If coaches can still edit that line, put the control back where it lives.

---

## 11. Toasts

Toasts can carry one action button on the right. With an action they stay 5.2 seconds
instead of 2.8, because 2.8 is too short to read and tap.

- **Save**: "You saved **{class}** to your week" + **Share your week** → opens the
  composer. Action hidden when sharing is off.
- **Unsave**: "Removed from your week", no action
- **Follow**: see section 6

---

## 12. Activity

Opened from the bell. Shows activity from coaches you follow.

A gear in the sheet header reveals tuning **inline**, so turning something off shrinks
the list in place rather than sending the user to settings:
- New classes
- Time changes and cancellations (scoped to classes on your week — the only genuinely
  useful one)
- New followers
- Saves on your classes (coaches only)

Plus a mute row of chips for people you follow.

**Coach saves are batched**: one digest row a day, "6 people saved your classes this
week", with the busiest class named underneath. Never one notification per save.

---

## 13. Explicitly out of scope

Dropped deliberately, listed so they don't get reintroduced:

- **Coach claiming of member-added classes.** Too much too soon. The disclaimer and
  the report path carry the correction load instead. The signal to revisit is coaches
  asking for their classes back.
- **Who saved a class**, member-facing. Comes back when enough people are saving.
- **Following studios.** A studio's calendar is the union of its coaches, so following
  one mostly re-delivers classes you already get. Studios are discoverable only.
- **Clubs.** Not yet.
- **Members and classes as Discover types.**
- **Booking, payments, spots, availability.** FittList is not a booking system, and the
  disclaimer says so.
- **A Dice-style time rail** (Tonight / This week / Pick dates). At roughly a dozen
  classes a day, "Tonight" and "This week" return nearly the same list. Revisit when an
  ordinary weekday reliably has 20 or more classes and "tonight" alone returns 8.

---

## 14. What to measure

The whole point of this release is a test.

1. What fraction of active members save anything in a given week
2. Saves per active member per week
3. Whether saved classes lead to shares

Save without share means you've built a private planner, which is a fine product but a
different one. Save plus share means the social layer has something to stand on, and
saved-by counts can come back.

---

## 15. Resolved before building

The brief's open questions, and the ones reading it against the existing code
raised. Answered by Matt; written here because a decision that lives only in a
conversation is a decision the next person has to make again.

**One catalog, and editing is a suggestion.** A member-added class and a
coach-added class are the same record with a different creator. The precedent
is the studio directory, which has worked this way since it shipped: a place is
the commons until somebody claims it, corrections come from anyone, and one
`studio_managers` row flips it to owned.

Three bounds on that, or the commons costs more than it earns:

* Direct edit belongs to the creator, the coach on the class, and the studio's
  managers. Everybody else suggests, through the same pipe `studio_edits`
  already uses. Anyone editing anything means one bad actor moves a coach's
  Tuesday to Wednesday and every follower's calendar is quietly wrong.
* A coach's own class is never in the commons. If `coachUserId` names a real
  account, that account owns it outright and there is nothing to claim.
  Claiming exists for records naming a coach who isn't here, or naming nobody.
* A member-added class carries the **venue** as its byline, never a person.
  Naming a coach who has not joined publishes their whereabouts on their
  behalf, and "naming your coach is not putting them on the platform" is a line
  this app already holds.

**Dedupe is the product, not a detail.** The brief's rule (attach on venue and
start time within 20 minutes) is not safe on its own: two rooms at six o'clock
pairs the yoga with the spin, and a wrong attach is worse than a duplicate
because it takes a real class off somebody's calendar. The gym's own pairing
learned this and matches on name as well. Attach on a strong name match with
venue and time; anything weaker suggests rather than merges.

**The past survives.** It is also already built, which makes keeping it free and
removing it the work: `usePastReveal` prepends past days as the list scrolls up,
`CAL_PAST_DAYS` is eight weeks, and the Month grid dims past days rather than
dropping them. A coach asked "when did you coach last week" needs it, and the
gym side already depends on looking back: `gymCounts()` counts dates worked for
a pay run and `freezePast()` exists so that history stays honest.

Day pills still start at today. They and a list that scrolls backwards are two
controls that can disagree, so the pills follow the scroll: they say where you
are rather than where you started. Today moves into the sticky block beside the
title, because the floating row is now Share and Add.

**One Schedule route.** `/app` and `/week` collapse into one calendar for both
kinds. The other two redirect, and `/app` stays the installed app's `start_url`.

**No Coaching/Going segment, and relationship chips instead.** The segment is
the two-hat model leaking into a screen that no longer thinks that way, and it
can only say two of the five things. The Classes sheet gets the same
relationship chips the Schedule filter uses, bulk-selecting: one tap for a
teaching-only picture, individual checkboxes underneath for the fine work. A
member is never offered a Coaching chip, by the rule Discover already follows:
a filter is only drawn where it can narrow something.

The headline is derived from what is on the picture rather than from a mode. All
Coaching, and it reads "Come train with me"; anything else, "My week". That
answers the brief's second open question without putting an editor back. The
first answers itself: the range control was removed deliberately and `SPAN_DAYS`
is 7.

**Studio admin is untouched.** The rota, the shifts screen, swaps, requests and
the shift counter all stay exactly as they are, reached from Your studios on the
You tab. Shifts keep landing on a coach's calendar.

**Settings move behind a gear on You.** This reverses "there is no gear anywhere
the tab bar renders", which was right when the You tab was the only door and is
wrong now that the tab is a person rather than a settings list.
