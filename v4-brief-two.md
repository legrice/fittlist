# FittList — build brief, part two

Read `v4-brief.md` first (and `BUILD-BRIEF.md` before that for the original product). This is what changed after it. Where the two disagree,
**this file wins**.

Reference prototypes:
- `design/fittlist-prototype-v4b.html` — the app. Personas in the grey dev bar: John (member),
  Matt (coach), Tom (schedule-only coach), New member, New coach.

---

## 1. The big one: Schedule is your calendar, not a feed

**Following a coach no longer puts their classes on your schedule.** Schedule shows
only things involving you: what you're coaching, what you've saved, what you added,
your personal sessions.

Following gives you a **circle at the top of Schedule**. You tap a circle, see that
coach's week in a sheet, and save the classes you're actually going to. That save is
what puts a class on your calendar.

Why this matters more than it looks: under the old model, saving barely changed the
screen because the class was already there from the follow. The whole point of this
release is testing whether people save, so saving has to be the thing that does
something.

Three consequences:
- Schedule and Your week are now the same object
- The "From coaches I follow" relationship type is gone
- The circles are load-bearing, not decoration

**The cost, worth watching:** no passive browsing of what your coaches are up to. If
saves per member stay flat in the beta, the fix is a "New from your coaches" strip
under the circles, not reverting the model.

---

## 2. The circles tray

Sits directly under the app header, above a hairline divider, and **scrolls away like
an Instagram stories tray**. It does not pin. That's the whole answer to "won't this
make the screen noisy" — it costs height once, when you open the app.

- Circle per followed coach, first name underneath
- **A sienna gradient ring means that coach has added classes since you last looked.**
  It clears when you tap them. Without this the tray is decoration.
- A dashed **Find** circle at the end opens Discover
- No tray at all on an account that follows nobody

**Tapping a circle opens a peek**, not a navigation: their week as compact rows, each
with a Save button, plus a Profile button in the sheet header. You can save two classes
and dismiss without leaving Schedule.

---

## 3. Schedule layout

Removed: the "Schedule" page title (the nav already says where you are) and the date
pills (the day headers already carry the dates, and the month view handles jumping).

The stack is now:

| | |
|---|---|
| FittList header (wordmark, BETA, bell) | scrolls away |
| Circles + divider | scrolls away |
| **List toolbar** | **pins** |
| Day sections and cards | content |

**The toolbar belongs to the list, not the app header.** Filter in the header corner
was wrong: a word pill jammed between a wordmark and a bell, controlling a list it
wasn't near. It reads: a quiet count on the left, then the month toggle, then Filter.

**The pinned toolbar does what calendars do — the label follows where you are in
time.** At rest it says "7 this week". Scrolled, it becomes "Today", then "Fri, Aug 7".
In month view the left slot reads "August".

**Today button.** A sienna pill appears in the toolbar only when today is off screen,
and disappears when you're back. No permanent chrome for an occasional action.

Day headers name today explicitly: **"Today · Wed, Aug 5"** with the sienna dot.

**Filter is always visible**, even when there's little to filter.

---

## 4. The filter, on one axis

The old set was incoherent: five options across three different axes (relationship,
provenance, privacy, session type), and two of them overlapped, since a class you added
yourself was also saved.

One question now: **what are you doing there.**

| Key | Label | Colour | Meaning |
|---|---|---|---|
| `coaching` | Coaching | `#C4532B` | You teach it |
| `going` | Going | `#3E6B8A` | You saved it or added it |
| `personal` | Personal | `#6B6470` | Private, only you |

Mutually exclusive, and every item is exactly one of them. **"Added by me" is gone as a
filter** — provenance is a property of a record, not a way to slice a week. The card
still shows "You added this" with a Yours chip.

The filter sheet only lists kinds you actually have, so nobody filters to an empty
result.

Three kinds for a coach, two for most members. The `client` token from the personal
training work is deliberately absent — see section 12.

---

## 5. Three empty states

**Member, following nobody.** Two cards: Add a class first, Follow a coach second. Add
comes first because it always succeeds.

**Member, following someone, nothing saved.** This is the important one, and it's new.
A nudging arrow pointing at the circles, then:

> **Pull classes from your coaches**
> Following Matt doesn't fill your week. Tap a face above to see what they have on,
> then save the ones you're going to.

Two cards: **See a coach's week** (stacked faces of who you follow, names underneath,
opens the peek directly for one coach or a short "Whose week?" chooser for several) and
**Add a class**.

Say "following doesn't fill your week" out loud. Every other app they use works the
other way, so without that sentence people conclude the app is broken.

**Coach, no classes.** One card, Add a class, and nothing about following. A coach
opening the app for the first time has one job and discovery isn't it.

---

## 6. Coach profiles

Per-person **filtering** is gone. Per-person **viewing** is a profile, which is a better
answer anyway: it shows who they are, what they teach, and gives you somewhere to
unfollow.

Two ways in:
- You tab → the Following stat is tappable → list of who you follow → tap one
- Any class card → "Coached by X ›"

The profile is avatar, name, what they teach, a Follow/Following button with a line
explaining what it does, then their classes by day as normal saveable cards.

**Watch the copy on that line.** It cannot say "their classes show on your schedule" any
more, because they don't. Following puts a circle on your Schedule, nothing else. Use:

- Following: *In your circles. Save any class below to put it on your week.*
- Not following: *Follow to keep their week one tap away on Schedule.*

The same trap exists anywhere else that describes what following does — the Discover
follow toast, the Find more coaches row in the Following list, onboarding. Every one of
them has to describe access, not delivery.

---

## 7. The public pages

The surfaces strangers actually see: a coach's page (`fittlist.co/matt`), a studio page,
and a single class page. All logged out. Neither brief covered them, which is odd given
the link in bio is the original point of the product.

**What updates already:** a coach adding a class updates their public page and the schedule
on the associated studio page. That's built. Nothing here changes it.

### Freshness stamp

A quiet line under the coach's name, and under the studio name on studio pages:

> **Updated 2 days ago**

Derived from the last change to any class on that page, not from profile edits.

The real risk on a link-in-bio page isn't that FittList doesn't take bookings, it's that
the schedule is three weeks stale. A freshness stamp handles that honestly and reads as
confidence rather than a warning, which a caveat never does. It also nudges the coach:
nobody wants their public page saying "Updated 3 weeks ago" under their name.

Suggested wording, so it degrades gracefully:

| Age | Line |
|---|---|
| Today | Updated today |
| 1 to 6 days | Updated 3 days ago |
| 7 to 20 days | Updated 2 weeks ago |
| 21 days or more | Last updated 25 July |

Past three weeks it switches to an absolute date, because "updated 4 weeks ago" is vaguer
than the truth and this is the case where a visitor most needs the truth.

### The disclaimer, by surface

Not blasted. Two treatments:

- **Coach page and studio page:** one quiet line in the footer, beside the FittList mark.
  > Times are posted by coaches and can change. Check with the studio.
- **Class page:** the full version, bottom of the page, exactly as in the app.

Footers are the right home for the short version. It's there when someone goes looking and
invisible otherwise, and it doesn't undercut a page a coach is proudly linking from
their bio.

### Source confidence

The disclaimer should be a function of who posted it, so that it can be retired rather than
apologised for forever:

| Source | Treatment |
|---|---|
| Member added, unclaimed | Strongest wording. Nobody official has confirmed this class. |
| Coach added | Standard line. Posted by the coach, may not match the studio's schedule. |
| Studio managed, verified | No disclaimer. Just "Posted by Ironbound Performance Athletics." |

With studio management landing, this gives studios a concrete reason to verify beyond
control: verifying visibly upgrades every class they own from "a coach said so" to
authoritative, and clears the caveat off their own page.

---

## 8. Your reach (coach-facing numbers)

Coaches seeing their own numbers is not the social layer, so it can ship now.

**Your reach** on the You tab, under Your week, hideable via the ··· in its header:
- **Opens leads, at large size** — the number of times your shared week was opened. It's
  the only feedback a coach gets on the share image, and right now they get none.
- Then saves all time, profile views, followers
- Share next week closes the card

**Per class**, on the coach's own class, where members see the save button: "26 people
have saved this class", with an "Only you see this" chip. **Suppressed entirely at
zero** rather than rendering "0 saved".

Note: I originally wrote "26 saved · 4 this week" and it was bad copy. On a page about a
single dated class, a weekly delta reads like four people are coming this week. Deltas
belong on the reach card, where the number is an aggregate.

**Never show coaches who saved.** Counts only. The definitions sheet says so, and that
line should survive into later versions.

**Zeros**: keep reach figures cumulative until a typical coach clears roughly five saves
a week, then switch to weekly with a trend. "26 saves all time" reads like traction;
"0 this week" reads like failure.

**Activity batches saves**: one digest a day, "6 people saved your classes this week",
with the busiest class named. Never one notification per save.

---

## 9. Toasts

Toasts can carry one action on the right. With an action they stay 5.2 seconds instead
of 2.8, because 2.8 is too short to read and tap.

- **Save**: "You saved **{class}** to your week" + **Share your week** → opens the
  composer. Action hidden when sharing is off.
- **Follow**: "You followed **{coach}**. Pick what you want on your week." Then the app
  switches to Schedule and **opens that coach's peek automatically** after a beat, so
  the first thing a new follower does is pull classes onto their week.

**Gate the auto-peek.** Do it on the first follow of a session, or when the schedule is
empty. Otherwise someone working down the Discover list gets interrupted on every tap.

---

## 10. Schedule-only mode (Tom), updated

The sharing switch now controls six places, and nothing may leak through:
1. The Your week pill on Schedule
2. The Your week section on You
3. The share button inside it
4. The share icon on the profile
5. The Share your week action in the save toast
6. Share next week on the reach card

With sharing off, the floating row switches to right-aligned so **Add stays in the same
place** rather than sliding left.

---

## 11. Small decisions, so they don't get relitigated

- Discover page title is **Discover**, not Coaches. Search placeholder is
  "Search coaches"
- **Follow is outlined, Following is filled black.** Deliberately inverts the usual
  convention; it reads as a selection state
- The share pill on Schedule reads **"Your week"**, not "Share your week"
- Share composer: **Save image and Share image side by side**, Save outlined left, Share
  filled right
- On the You tab, **Your week sits above Your reach**
- Only today gets a dot, on the day header
- Card top right holds exactly one thing: a bookmark, or a Coaching / Client / Personal
  chip. Never both

---

## 12. Changes and cancellations

Nothing in either brief covered this, and it's the thing that decides whether saving is
trustworthy. If you save Wednesday at 6pm, it gets cancelled, and the app says nothing,
saving is worse than useless: it gave you false confidence and you showed up to a locked
door.

**Who gets told: people who saved it. Nobody else.** Followers who didn't save get
nothing. This is the whole point of the pull model — a save is a signal of intent, and
intent is what earns a notification.

**Cancelled classes do not silently vanish.** A thing disappearing from your calendar
without explanation is worse than a cancelled row. The card stays where it was for the
rest of that day, muted, tagged **Cancelled**, with the save control replaced by Remove.
It drops off on its own after the day passes. Tapping it explains what happened and
offers a way to find something else at that studio that day.

**Time or venue changes update the card in place**, tagged `Moved · was 1:00pm` for 48
hours so the change is visible rather than silent. Venue changes are higher priority than
time changes: a person can absorb 30 minutes, they cannot absorb the wrong building.

**Push only when it matters:** the class is on someone's week and it starts within seven
days. Beyond that, in-app is enough.

**Batch by editor, not by class.** Coaches bulk-edit a week in one sitting. Three separate
pushes from one editing session is how you get notifications turned off. One message:
"Melika changed 3 classes this week."

**Series cancellation notifies once**, not once per occurrence.

**On the coach side, the confirm dialog states the blast radius:** "3 people have this on
their week. They'll be told." That's a soft deterrent against careless edits, and it's the
first time a coach sees that their reach numbers describe real people.

---

## 13. Push

The pull model removed passive discovery, so a ring you have to open the app to see is now
carrying a lot of weight. Push has to carry the rest, and it's the app's only outbound
voice besides the change notices above.

Ranked by value, which is the opposite of the order most apps ship them in:

1. **Changes and cancellations to classes on your week.** Always on. This one is a service,
   not marketing, and it should be hard to turn off.
2. **New classes from coaches you've saved from before.** Saving from a coach is a much
   stronger signal than following them. Immediate, but capped at one per coach per day.
3. **A weekly digest.** "Melika and 2 others added classes for next week." Sunday evening,
   which is when people plan. This is the one that keeps the pull model alive.
4. **An empty-week nudge, only if your week is actually empty.** Sunday evening as well,
   and never two Sundays running.

**Never push for every new class.** That's how a coach with a full timetable becomes the
reason someone disables notifications, and then they miss number one.

Push settings mirror the existing in-app activity tuner rather than living somewhere else,
so there's one mental model for "what reaches me."

---

## 14. Ending a repeating save

You can start a series from a class page ("Save every Tuesday") but there's currently no way
to see or stop one except un-saving occurrences one at a time.

- **A Repeating row on the You tab**, under Your week: "Repeating · 2", opening a list with
  a Stop on each. Without this, a series is a thing you can start and not find again.
- **Un-saving one occurrence of a series asks once:** *Just this week, or stop repeating?*
  Getting this wrong in either direction is annoying, and it isn't guessable.
- **Skipping one week does not end the series.** The card should say so at the moment it
  happens, the same way the client-side skip did.
- **No auto-expiry.** It reads as punitive and there's no attendance data to justify it. Make
  the list easy to find instead.

---

## 15. Unfollowing

**Classes you already saved stay on your week.** You saved them; that was a separate act
from following. Somebody will implement it the other way if this isn't written down.

What does change: their circle leaves your Schedule, and their future classes stop being
reachable through the peek path.

**One exception worth handling.** If you have a repeating save from that coach, ask at the
moment of unfollow: *You still have MF Strong repeating every Tuesday. Keep it?* Otherwise
someone unfollows, forgets, and finds a mystery class on their calendar in three weeks. No
confirm dialog otherwise — unfollowing should be one tap.

---

## 16. Analytics events

Name these before you build, or you'll finish the beta with a working app and no way to
answer the question you built it to answer.

**The core loop**

| Event | Properties |
|---|---|
| `class_saved` | class_id, coach_id, source (`peek`, `class_page`, `adder`, `share_composer`, `profile`), is_series |
| `class_unsaved` | class_id, reason (`manual`, `series_stop`) |
| `class_added` | creator_role, listed, matched_existing |
| `coach_followed` | coach_id, source (`discover`, `peek`, `profile`) |
| `coach_unfollowed` | coach_id, had_saves |
| `peek_opened` | coach_id, had_ring |

**Share funnel**

| Event | Properties |
|---|---|
| `share_composer_opened` | source (`schedule_pill`, `you_tab`, `class_overflow`, `save_toast`) |
| `share_image_created` | class_count, style, photo_shown |
| `share_completed` | method (`share`, `save`) |

**Public pages**

| Event | Properties |
|---|---|
| `public_page_viewed` | coach_id, freshness_age_days |
| `public_page_class_tapped` | class_id |

**Usage**

`schedule_opened` (mode, item_count), `filter_applied` (kinds), `today_tapped`.

### The one funnel that decides whether the pull model works

**follow → peek_opened → class_saved.**

- Follows high, peeks low → the ring isn't doing its job. Fix the signal, not the model.
- Peeks high, saves low → either the classes aren't compelling or the save isn't legible.
- Both healthy → the model works and saved-by counts can come back.

Read that funnel before you read anything else.

### Metrics to define up front

- **Activation:** share of new members with at least one save in their first seven days
- **Core:** saves per active member per week
- **Coach health:** share of coaches who share an image in a given week
- **Trust:** share of saved classes that get cancelled on someone

---

## 17. Still open

1. **Nothing sets the date range** in the share composer. If the start-date and
   number-of-days control still exists, it belongs in the Edit sheet under the title.
2. **No headline editor** appears in the shipped composer screenshots.
   "COME TRAIN WITH ME" is hardcoded in the prototype. If coaches can still edit that
   line, put the control back where it lives.
3. **Anchor Schedule on today** when the tab opens and when returning from another tab.
   Landing on the wrong day makes a calendar feel broken rather than buggy. Still the most
   likely thing to get wrong in this build.
4. **Avatar chips instead of circles** for the tray, if the height matters. Faces at
   ~50px still read. If you go that way, drop the "All" chip — the rail is a source now,
   not a filter.

---

## 18. Out of scope, still

Everything in section 13 of the first brief holds: no class claiming, no member-facing
saved-by, no following studios, no clubs, no members or classes in Discover, no booking
or payments for group classes, no Dice-style time rail.

Added to that list:
- **Per-person filtering on Schedule.** Profiles replaced it.
- **Past scrolling, dimmed past days, and the Now line.** Built, then cut as too complex
  for this pass. Worth revisiting once the calendar feels settled.
- **Personal training, entirely.** Client sessions on the calendar, the client booking
  link, availability, requests and the freed-hour offer were all prototyped and are all
  out of this build. Nothing about PT ships here. When it comes back, the two rules worth
  keeping are that availability derives from the calendar rather than being maintained by
  hand, and that client sessions never enter Your week, so a client's name can never reach
  the share image.

---

## 19. Built: the tray and the peek

The first two pieces of section 2 are in, on `calendar-merge`, with
`scripts/tray-smoke.mjs` holding the whole loop: follow, circle, peek, save,
and the class landing on the calendar.

**The pieces.** `myCircles()` (`src/lib/circles.ts`) is the faces, sorted
fresh-first then alphabetically, with `fresh` computed from
`classes.createdAt > subscribers.peekedAt`. `coachPeek()`
(`src/app/actions/peek.ts`) is one coach's fortnight, asked of
`publicSchedules()` so the peek and the coach's own page can never disagree,
with the viewer's marks resolved into a `saved` boolean per occurrence.
`CircleTray` and `CoachPeek` are the two components, and both calendars render
the tray: a coach follows coaches, and a coach who follows five people and sees
no faces would conclude the button does nothing.

**Decisions worth not relitigating.**

*The ring goes out on open, not on close.* The ring promises there is something
in here, and that promise is kept the moment somebody is looking. Firing on
close loses it to a reload or a back swipe, and a ring lit over classes already
read is a ring nobody believes twice.

*The tray renders on an empty calendar.* It sits outside the `bare` gate that
strips the rest of the chrome. A week with nothing on it and five circles above
it is the exact state where the tray is the thing to tap, and hiding it there
would show somebody who follows five coaches a screen that says they have
nothing.

*Fourteen days, not the calendar's nine weeks.* This is a glance at what
somebody has on. A list you scroll for two months is a page, and the page
already exists behind "See their page".

*The peek's day headings are `fmtDayHeaderRel`.* They said "Wednesday - Aug 5"
for one build while the calendar a tap underneath said "Today", which is one
day named two ways on two screens. One function decides those words.

*A shift's base is the studio, not the coach.* The gym owns the class, so a
covered date opens under `s/{slug}`. The header still names the coach whose
circle was tapped, never whoever the rota has on the first row: this sheet
answers "what has Erin got on", not "who is working".

*Nothing in the tray or the peek is underlined.* The app underlines a bare link
by default, which is right in prose and wrong on a list: a column of underlined
class names over underlined sub-lines reads as a page of hyperlinks rather than
a week.

**Not built yet, from the same section.** The card treatment from the Figma
(white cards, the relationship colour as a thick left bar, the chip or the
ribbon top-right) is still the old flat `.ps-event` row underneath, so a saved
row wears the old green rather than `--rel-saved`. The Following tab has not
collapsed into Schedule. Both are the next commits.


---

## 20. Built: Following collapses into Schedule

Section 1 is in. Two tabs, Discover and Schedule, plus your face in the corner.

**`/feed` redirects rather than 404s.** It was the front door for months, so it
is in old emails, in bookmarks, in `?from=following` links out in the world,
and on the home screen of anybody who installed the app while it was the
landing. `activeTab` maps it to Schedule so it lights the tab it lands on. The
merged week's renderer (`FeedAgenda`) is deleted; the screen is in git at the
commit that replaced it.

**`landingHref()` answers per kind**, `/app` for a coach and `/week` for a
member, rather than leaning on the two calendars' redirects: that would put a
hop on every sign-in and every OAuth callback for half the app.

**The follow hint was lying twice over** and is rewritten. It promised a
coach's classes were "on your Following week": there is no Following week, and
a follow puts nothing on a calendar. Somebody who goes looking for classes that
were never added concludes the follow failed.

**The swipe moved rather than died.** It belonged to the merged week; it is on
the peek's rows now, which is where saving happens. It sits outside
`ClassOpener` on purpose: both catch the click in the capture phase, so the
outer one goes first, and with the opener around the list every completed swipe
also opened the class it had just saved.

**Peek rows open a sheet rather than navigating**, the way every other list in
the app does. As bare links they threw the peek away: you tapped one class out
of a fortnight and landed somewhere with no way back to the other thirteen.

### The known gap: no desktop arrows on the tray

The feed's coach strip carried `.railarrow` buttons gated on
`(hover: hover) and (pointer: fine)`, so a mouse could walk a rail it could not
swipe. The circles tray scrolls but offers no such control, and the two blocks
of `desktop-smoke` that covered those arrows are deleted rather than moved,
because the component they tested is gone.

This is written down rather than quietly dropped. The argument that produced
those arrows still holds: "can't swipe" is a property of the pointer, and above
940px the tray is a rail somebody has to drag with a trackpad. It wants the
same treatment, and it is its own commit.
