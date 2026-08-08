# Simplify: calendars and following

The build this branch is named for. Matt's words for it: *build a calendar,
share a calendar, follow a calendar.*

The app had grown a screen for every idea anybody had, because every idea was
cheap to add. The answer is not a better bottom bar, it is fewer things. This
file is the running record of what was decided and why, because most of it was
decided in conversation and the reasoning is the part that gets lost.

---

## The shape

| Tab | Who | What |
| --- | --- | --- |
| **Calendar** | coaches only | the classes they teach. Nothing else |
| **Following** | everyone | the merged week of the coaches you follow |
| **Profile** | everyone | settings, studios, and the management work |

Three at most, and the third only for somebody who teaches. Discovery is not a
tab (it is the search button on Following and the plus at the end of the rail),
settings are not a tab (the gear on Profile), adding a class is not a tab (the
plus on Calendar). A tab is a place you live, not every door in the building.

A coach is not a different account. It is a `users.kind` that carries a
calendar, which is what makes "I teach too" a toggle rather than a migration:
it adds the Calendar tab and lists you in Discover, and turning it off takes
both away.

## What came out, and the one that matters

Going marks. Personal entries. A member's own calendar. The tray and the peek
built the day before this. Discover as a tab.

The one that matters is the member's calendar, and it is worth being precise
about why removing it made so many screens better at once. It was never one
feature. It forced **every** surface to answer "whose is this?" - teaching,
going, personal, shift - which is four relationships, four colours, four tap
behaviours and a legend in a sheet to explain them. Take the member's calendar
away and that question stops existing everywhere simultaneously. That is why a
day of deleting improved more screens than a month of adding did.

**The tables stay.** `attendances` and `personal_classes` stop being read, but
nothing drops them: 95 beta users have rows in both, un-rendering is reversible
and free, and a migration is neither. There is no reason to spend that until
the simpler app has been lived with.

## What is deliberately kept

**The public profile is untouched.** Not trimmed, not restyled, not ported to
the new row: `/{handle}`, `/{handle}/about` and `/{handle}/studios` stay exactly
as they are, tabs and all, with the bio, the certifications, what to expect, the
disciplines and the studios. Matt's call twice over, the second time in as many
words: *we can basically keep it exactly as it was.*

The handoff's profile was much flatter, and following it would have deleted the
one part of the app coaches are actively enjoying. It is also the right call on
the merits: the public page is the product. Depth there is a coach's reason to
send the link, which is the same reason the poster gets ten styles. Everything
else in this build gets simpler; this one thing does not, because the argument
for simplifying is that fewer things are easier to use, and nobody is
struggling to use their own profile.

Anything in this build that touches `PublicProfileView`, `ProfileTabs` or the
three `/{handle}` routes is out of scope unless it is removing a going mark.

This is a different screen from the Profile **tab**. `/you` is yours to work
in: your face, your followers, settings, your studios, the rota. `/{handle}` is
what a stranger reads. Both can be true and neither should look like the other.

**The rota and the studio management.** Not decoration on top: it is the part
that gives the app a pulse between posters. A coach sets their week up and it
runs itself, so there is genuinely no reason to open this daily; a shift
changing is the one thing that is actually urgent. Retention will look thin by
normal app metrics and that is the ethos working, not a bug, but the rota is
what makes somebody open it on a Tuesday.

## The week, everywhere

One week at a time, an arrow either side, three in the range (this one, next,
and the one after). Both Calendar and Following take this shape.

The app drew a schedule four different ways and a person moving between two
tabs was reading two apps. Worse, an infinite forward scroll hid how light a
week really was; a range with an end gives the screen a size. `sundayOfWeek`,
`weekDates` and `weekRangeLabel` live in `format.ts` so the two tabs cannot
disagree about which week they are on, and `WeekView` is the one renderer.

Only days that hold something are drawn, so a light week reads as a light week
rather than a wall of blanks. An empty week is a screen in its own right: the
first week offers the thing to do, a later one only says there is nothing
there, because "add your first class" is wrong advice on a week somebody
flipped forward to.

## A class, tapped

`ClassPeek`, one sheet with two readings. Your own offers Edit and Cancel, with
the whole thing off as a link rather than a third button: it is the rarest of
the three and the only one that adding a date back does not undo. Somebody
else's offers the picture and the way to their week, and offers nothing to add,
because there is no longer a calendar to add it to.

It replaced a full-screen overlay carrying a photograph, a description, booking
links, a Going pill, the coach's roster and an admin photo tool behind a menu.
That answered every question anybody had ever had about a class. This answers
the three somebody actually taps for: when, where, and whose.

The class page at `/{handle}/{classId}` still wears the old overlay, because a
link somebody was sent has to open something real. Reconciling the two is its
own commit and it should end with this one winning.

## Sharing is the growth channel, so it gets the variety

This is the strategic bet and it is worth stating plainly: the poster is the
only loop in the app that reaches somebody who has never heard of it. Every one
carries `fittlist.co/{handle}` onto a story. Following moves people who are
already inside; the image is the front door. So variety is not decoration, it
is the acquisition channel, and "it gets boring after five or six posts" was a
real threat to the only channel there is.

**Ten styles, three colourways each.** Thirty posters, which is a coach posting
weekly for most of a year without repeating themselves.

Colour belongs to the style rather than sitting beside it as a free second
axis. Ten times eight would have been eighty and most of them wrong: a diner
sign in Midnight is not a diner sign, and the loud styles depend on specific
pairings a global picker would happily break. The first answer to that was
going to be excluding some styles from the colour picker, which is a rule you
have to explain; this is a shape that holds itself up, because the wrong
combination cannot be expressed. Thirty where every one is good is the better
number even though it is smaller. It also makes the picking simpler, which is
the whole point: choose how loud, then choose which of three.

Every style is data rather than a branch, so `renderStory` stays the one paint
function it has been since the third copy of it drifted from the other two.

**The trap, for anyone adding a style.** `planStory` fits a week to a fixed
canvas using one set of constants and `check:story` holds 6,048 synthetic weeks
to it. A style that quietly grew its rows would pass the planner and overflow
the paint, which is the exact failure the planner exists to prevent. Each style
carries a `rowScale` and the routes divide the budget by it: fitting scaled
rows into B is the same as fitting plain rows into B/k. Err high. A style that
draws shorter than it claims wastes a little canvas; one that draws taller
loses somebody's Thursday.

`storyLook()` resolves style and colourway from the URL and heals itself: a
colourway that does not belong to the style falls back to that style's first.
Old `?theme=` links still resolve, because the lookup is by label rather than
by index, which is also what lets one palette appear under several styles
without being copied.

**The share sheet keeps its pickers.** Range, classes, and now style then
colour. What it loses is the Coaching/Going segment, because there is no longer
a going half to pick.

## Still to build

- Following: the merged week, the rail as a filter, the search FAB
- The Profile tab: settings sheet, "I teach too", followers as a link
- The class sheet's tappable rows: `COACH ›` and `STUDIO ›`
- The share sheet's Week / Profile / QR segments
- The going and coaching removal sweep across every remaining surface
- Five style references from Matt, to replace Plain, Bare, Grid, Receipt and
  Editorial: those five are variations on quiet, which is one idea four times
  over and exactly the bloat this build exists to cut
