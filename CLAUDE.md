# fittlist

A link-in-bio weekly schedule and digital business card for group-fitness
coaches, plus a member side: follow coaches, see one merged week, mark classes
you're going to. Intentionally small. It answers one question well: "How do I
train with you?"

## House style for copy

**Never use em dashes.** Not in UI text, not in emails, not in anything a user
reads. `npm run build` fails on them (`scripts/check-copy.mjs`), and so does
`npm run check:copy` on its own. Comments are exempt; they're for us.

When you'd reach for one, use the punctuation that fits the job it was doing:

| The dash was... | Use |
|---|---|
| joining two independent clauses | a full stop, or a semicolon |
| an aside in the middle of a sentence | a pair of commas, or parentheses |
| introducing a list, or an answer | a colon |
| a trailing afterthought | a comma |

A hyphen is not a substitute; it reads as a typo. Rewrite the sentence.

**The one exception is the date header**, which reads `Wednesday — July 24`.
A date is a label, not a sentence, and the dash is its shape rather than
punctuation. It lives in `fmtDayHeader` and carries a `check-copy-ignore`
pragma; a line with that marker (or a comment above it carrying it) is skipped.
Adding another exemption should feel like a decision, not a convenience.

The middot separator (`·`) used in labels and sub-lines is fine too.

Otherwise: plain words, short sentences, no exclamation marks, no "simply" or
"just" telling someone a thing is easy. Say what happens, not how they should
feel about it.

## Running it

```bash
npm run dev                      # localhost:3000, PGlite at .data/pglite
npm run build                    # runs the copy and story-layout checks first
npm run db:generate              # after any schema change
npm run check:story              # the story image fits its canvas (no browser)
```

Migrations run automatically on the first `getDb()`, so a fresh `.data/pglite`
is safe to delete whenever a test needs a clean slate.

## Test suites

Each needs its own env and a fresh database. Log the server to
`/home/user/fittlist/server.log`; the scripts read it for emailed links.

```bash
rm -rf .data/pglite
INVITE_ONLY=false FANS_ENABLED=true CRON_SECRET=smoke-cron \
  ADMIN_EMAILS=matt@example.com npm run start > server.log 2>&1 &
node scripts/smoke.mjs            # the main end-to-end pass

rm -rf .data/pglite
FANS_ENABLED=true NEXT_PUBLIC_ORIGIN=http://localhost:3000 npm run start > server.log 2>&1 &
node scripts/invite-smoke.mjs     # the beta gate, invites, referrals

rm -rf .data/pglite
FANS_ENABLED=true NEXT_PUBLIC_ORIGIN=http://localhost:3000 npm run start > server.log 2>&1 &
node scripts/auth-smoke.mjs       # password recovery, the coach/follower choice

rm -rf .data/pglite
INVITE_ONLY=false FANS_ENABLED=true npm run start > server.log 2>&1 &
node scripts/private-smoke.mjs    # public vs private classes

rm -rf .data/pglite
INVITE_ONLY=false FANS_ENABLED=true npm run start > server.log 2>&1 &
node scripts/member-smoke.mjs     # a member's link, setup, profile and edits

rm -rf .data/pglite
INVITE_ONLY=false FANS_ENABLED=true ADMIN_EMAILS=matt@example.com \
  FEEDBACK_PROMPT_AFTER_DAYS=0 NEXT_PUBLIC_ORIGIN=http://localhost:3000 \
  npm run start > server.log 2>&1 &
node scripts/feedback-smoke.mjs   # writing in, the reply, the prompt

rm -rf .data/pglite
INVITE_ONLY=false FANS_ENABLED=true npm run start > server.log 2>&1 &
node scripts/desktop-smoke.mjs    # header links and the coach-rail arrows

rm -rf .data/pglite
INVITE_ONLY=false FANS_ENABLED=true npm run start > server.log 2>&1 &
node scripts/series-smoke.mjs     # the same class at two studios is two classes

rm -rf .data/pglite
INVITE_ONLY=false FANS_ENABLED=true npm run start > server.log 2>&1 &
node scripts/nav-smoke.mjs        # back pops instead of piling onto history

rm -rf .data/pglite
INVITE_ONLY=false FANS_ENABLED=true npm run start > server.log 2>&1 &
node scripts/going-smoke.mjs      # Going marks through an edit, a delete, a cancel

rm -rf .data/pglite
INVITE_ONLY=false FANS_ENABLED=true npm run start > server.log 2>&1 &
node scripts/pwa-smoke.mjs        # manifest, icons, the worker, the install row

rm -rf .data/pglite
INVITE_ONLY=false FANS_ENABLED=true ADMIN_EMAILS=matt@example.com \
  npm run start > server.log 2>&1 &
node scripts/gym-smoke.mjs        # the gym's rota: claim, assign, swap, count

rm -rf .data/pglite
INVITE_ONLY=false FANS_ENABLED=true npm run start > server.log 2>&1 &
node scripts/plans-smoke.mjs      # your plans: the shared rows, your own class
```

One reset per script, not per group: each claims the same handles and emails,
so a second script on a used database trips over the first one's account.

`NEXT_PUBLIC_ORIGIN=http://localhost:3000` matters for anything that follows an
emailed link: without it the redirect points at fittlist.co and leaves the
sandbox.

## How code gets written here

Four rules, distilled from Karpathy's guidelines and this codebase's own
habits. They're the difference between a repo one founder can steer and one
that quietly rots.

1. **Think before coding.** Say what you're assuming; when a request is
   ambiguous, name the reading you chose. Push back before building (the
   ethos section below is the strongest form of this).
2. **Simplicity first.** No speculative features, no abstraction until the
   third caller needs it. A new table, flag, or dependency must earn itself.
3. **Surgical changes, and reuse before you build.** Touch what the task needs
   and match the style around it. Don't refactor in passing; a cleanup is its
   own commit. Before writing a new screen, list, sheet or vocabulary, go
   looking for the one that already exists: a class row is `.ps-event`
   everywhere it appears, a bottom sheet is `.sheet` with `.sheetclose`, a
   settings row is `.setrow`, a chip grid is `TypePicker`, and what a place
   offers and a person teaches are both `STUDIO_TYPES`. A second copy always
   drifts, and the drift is invisible until somebody screenshots both.
4. **Verify against the goal.** Every change ends with the build, a fresh-DB
   check of the actual behavior, and the affected suites. "It compiles" is
   not done; the suites in this file are the definition of done.

And the security floor: every server action starts with a session lookup and
scopes its writes by that user id (owner) or `currentAdmin()` (admin); all
signing goes through `src/lib/secret.ts`, never a local fallback; nothing
secret is ever passed as a prop to a `"use client"` component, because props
serialize into the page. `scripts/load-smoke.mjs` is the ceiling check when a
hot path changes shape.

## The ethos is a gate, not a poster

`ETHOS.md` is the product's constitution: four ordered laws, then the lines
fittlist doesn't cross (never addicting, nobody is the product, private by
default, no enshittification, charge in the open, few features done well,
human not artificial: AI helps build the product but never performs in it).
`/ethos` renders it in-app. Hold every feature request against it, including
the founder's own: when an idea serves no law or breaks a line, say so before
building, plainly and with the specific tenet named. That pushback is the
file's whole job. It changes slowly and reluctantly, and only when Matt says
so in as many words.

## Things worth knowing before changing them

**`runsOn()` in `src/lib/format.ts`** is the single predicate every surface uses
to expand a recurrence: schedule, public page, feed, digest, Discover, story
image, `.ics`. A weekly class is one row per weekday sharing a `templateId`;
`skipDates` cancels single occurrences. Change it there and everything agrees.
Callers must load full class rows, or the column silently goes missing.

**A Going mark points at a class row, so anything that replaces that row has
to deal with it first.** Editing a weekly class deletes and reinserts its rows,
and deleting one removes them; both used to hit the `attendances` foreign key
and fail outright, so a coach could not edit or delete a class the moment
anyone said they were coming. `save()` now carries the marks across by weekday
and `deleteClass()` clears them, and a delete tells whoever was coming
(`notifyCancelled`) rather than dropping them silently. Anything else that
rewrites `classes` rows needs the same care.

**A series is not a template.** `classes.seriesId` identifies one recurring
class: all its weekday rows share it, and editing or deleting "the whole thing"
means that id. `templateId` is only autofill memory, keyed on `(userId, name)`,
so a coach teaching Stretch+ at two studios has one template and two series.
Grouping by the template is what let an edit to either one delete the other and
rewrite it: change a description, lose a class. A new weekly class joins an
existing series when name, time, place and visibility all match, which keeps
"also on Friday" as one class; anything that differs starts its own.

**The app's day is US Eastern, not the server's.** Vercel's clock is UTC, so
from 8pm Eastern `new Date().toISOString().slice(0, 10)` is tomorrow, and for
months every screen showed Thursday as today on Wednesday night. `todayIso()`,
`occurrenceEnded()` and `mondayOfCurrentWeek()` in `src/lib/format.ts` are the
app's clock (`NEXT_PUBLIC_APP_TZ`, defaulting to America/New_York); anything
that needs "today" goes through them and never through `toISOString`. The
suites have to keep the same clock: a "yesterday" computed in UTC is the app's
today during that window, which is a legal end date, not a passed one. A
timezone per coach or per viewer is the real fix someday, and it lands in
those three functions.

**A class that has ended is off every schedule.** `occurrenceEnded()` drops
the been-and-gone occurrence from the public page, the studio page (the
gym's week and the community one), both You calendars, Following and a
member's week; a schedule is what's still coming. The class page itself
stays reachable by dated link and says "This one has already run", because
an old shared link has to land somewhere real, and the bare URL falls
forward to the next date it runs. The share images deliberately keep the
whole range they were asked to draw: a poster of the week is a record, not
a schedule. The one deliberate exception is your own calendar looking
back: the Month grid dims past days rather than dropping them, and the
List scrolls up into them (see the calendar's views below), because a
record of what you did is a thing a calendar owes its owner. Every public
surface keeps the rule.

**The story image has three levels of detail, and the sums have to match the
paint.** The canvas is a fixed 1080x1920 with no scroll, and the routes used to
draw rows until they ran out of it: eight classes clipped a real coach's poster
and twenty dropped twelve of them silently. `planStory()` in
`src/lib/storyplan.ts` now picks the most detailed layout that fits: a row per
class, then the same rows tighter with a shared studio lifted out of every one
of them, then a line per day with each class's times collapsed onto it. Only
past the third does a day come off, and then the poster says how many. The
heights live beside the tiers because Satori can't measure, so the only thing
keeping the footer off Thursday is `measurePlan()` counting what the routes
draw; `npm run check:story` holds 6,000 synthetic weeks to that budget and the
build runs it. Change a font size or a margin in either story route and change
its constant in the same commit.

**Feature flags** (`src/lib/flags.ts`) compare exact strings. `FANS_ENABLED`
must be literally `"true"` or `"coaches"`; `"1"` and `"yes"` are off.

**The beta gate** covers everyone, coaches and members alike
(`INVITE_ONLY !== "false"`).

**A handle is not a coach badge.** Members claim one too, and `/{handle}`
renders `MemberProfileView` instead of the coach page when `kind === "fan"`.
Anything asking "is this a coach?" must test `kind`, not `handle`: that
substitution was true for months, and `/admin` was still counting handles as
coaches long after it stopped being true.

**A follow is private.** Nothing public says who a member follows: their
profile is who they are and stops there. They see their own on Following, a
coach sees their own followers, and `/admin` counts both. That's the whole
audience. A list of "trains with 6" next to a "trains with 0" is a scoreboard,
and a profile that can be lost at is worse than no profile. The one place a
follow shows through is mutual: two members who follow *each other* see each
other on shared rows in Your week (`alsoGoing` in `myWeek`) and each other's
upcoming week on their profiles (`sharedWeek`, real public classes only, never
`personal_classes`). One-way follows surface nothing, which is what makes
tapping Follow on a person safe; agreeing to each other is the consent. A
coach separately sees who marked Going on *their own* classes (`roster` in
`classDetail`, owner-only): the mark was made at that coach, so the coach
seeing it is what the mark meant, and it never shows where else anyone trains.

**A Going mark shows to your followers by default, and the moment of marking
is where the choice lives.** This is the Home spec's one deliberate change to
the privacy line, made by Matt in `homescreenspec.md`: Activity and the "also
going" lines are made of these marks, and a feed of nobody doing anything is
no feed at all. `attendances.isPublic` (default true) is the switch; the note
that answers every add ("Added. Followers can see it.") carries "Make it
private" (`setGoingVisibility`), so the way off is offered in the moment
rather than buried in settings. Off never touches where the mark always
showed: the coach's roster and your own week keep it. The audience is still
only people who follow you, it never shows where else you train beyond the
marked class, and Personal rows never reach any of it: there is deliberately
no column that could make one public.

**A follow can be gated.** `users.approveFollowers` turns Follow into an ask:
the tap writes a `follow_requests` row (unique per trainer+requester, its own
table so a `subscribers` row keeps meaning exactly one active follow), the pill
reads Requested, and the answer lives on `/followers`. Approving inserts the
subscriber and tells the requester; declining deletes the row and tells nobody,
on purpose, because a "declined" notice is an invitation to take it personally.
Unfollow also withdraws a pending ask, so tapping Requested is the cancel.
Being listed in Discover and gating your followers are separate switches that
sit together in settings. Both directions clear in `adminDeleteUser`.

**"Member" is the word for someone who isn't a coach.** The column is
`users.kind` and its value is still `"fan"`, which is the odd one out and a
migration nobody needs yet; everything a person reads says member. Not
"follower": that names a relationship rather than a population, and a coach
who follows two coaches is one too, so it can't be counted.

**The tabbed shell is a layout, not per-page.** `/week`, `/feed`, `/discover`
and `/you` live in the `(tabs)` route group; its `layout.tsx` renders the header
and the tab bar once, and `loading.tsx` sits under it so a tab that's still
loading keeps its chrome. Put them back in the pages and the bar unmounts on
every navigation, which is the thing the layout exists to prevent. A new tab
moves into the group for that reason: `/week` was its own route with its own
copy of the shell, and left there it would have rebuilt the header and the bar
on every tap of Plans.

**One vocabulary for what a place offers, what a person teaches, and what a
class is.** `STUDIO_TYPES` was the studio editor's list; `users.disciplines`
picks from the same one, capped at four and validated against it in
`updateProfile`, and `CLASS_TYPES` is now that same list re-exported from
`format.ts` under the name that reads right at the call site. It was its own
shorter thirteen words for a long time, and the split broke the rule quietly:
"Kettlebell" found the kettlebell gyms and the kettlebell coaches and could
not be put on a kettlebell class at all, because the class picker had never
heard of it, so Discover drew its chips from two vocabularies for one idea and
a word that narrowed one half could not narrow another. Merging them is what
makes a class as findable as the people and places around it. Four words only
ever lived in the class list and `drizzle/0071_one_vocabulary.sql` lands them:
"Cycle" and "Run" rename to their shared-list synonyms, "Other" drops to null
because the picker already offers "No type" and a category meaning "none of
these" said twice is one too many, and "Conditioning" joined the shared list
instead of moving, since a gym can be a conditioning gym as easily as a class
can be a conditioning class. Every table that stores a type is migrated, or a
catalog pull puts the old word straight back. Leaving them would have made
orphans a coach could never pick again and drawn a "Cycle" chip beside a
"Cycling" one, which is the exact drift one vocabulary exists to prevent. So a
coach's "Yoga" is the same word as a studio's. That is what lets one filter in
Discover narrow both halves. Free text would be a hundred spellings and a
filter nobody could use, which is why `certifications` (free chips, a
credential) and `disciplines` (a pick, a category) are different fields.
`TypePicker` renders it for both, and "accepting clients" is a filter for free
because `users.availability` already says it.

**Discover has three halves now, and Classes leads.** The directory
answered "who teaches near me" and never "what can I do on Thursday",
which is the question people actually open the app with, so
`discoverClasses()` (`src/lib/discoverclasses.ts`) lists real dated
occurrences: public, from somebody who hasn't delisted themselves,
nobody blocked either way, not already been and gone, a gym's own rota
included (it has no handle, so the row carries the base its page lives
under). It wears the same chip rail the other two halves do, and
nothing else: the date range (Today, Tomorrow, This weekend, Next 7,
Next 14) and the Type dropdown and the total count are all gone. The
range was five answers behind a tap above a list that is already grouped
by day and already says which day each group is, and a filter that
mostly removes classes is the wrong control for a directory whose
problem is having too few; the day bands are the range, and the list
scrolls. The count went with it: it was a number nobody could act on.
When a date pick comes back it comes back as a real query rather than a
slice of the window the page happens to hold, which is the same note
`buildDiscoverClasses` carries. The rows are the app's one class row (`Agenda` +
`ClassCardActions`), so the ribbon means here exactly what it means on a
profile. The whole fortnight loads once, so a pick is instant and
nothing round-trips; that is the same
ceiling search hit before it moved to the server. The tab is Discover again and wears the compass, and
the magnifier went back to the header's corner: browsing is the tab,
searching every half at once is the corner, and the same glyph is never
in both places.

**Search is one box over all three halves; Discover is a segment you pick
first.** `/search` sits behind the header's magnifier and shows People,
Studios and Classes as headed sections at once, because you don't know which
half the thing you want is in: type "Stacey" and you want Stacey, and
Stacey's gym, on the same screen. A heading only exists when its section has
something in it, so a search that finds only places says "Studios" once and
nothing about people.
Both rows are the directory's own (`PersonRow`, `StudioRow` in
`DirectoryRows.tsx`, shared with `DiscoverList`): the Coach badge, the
availability dot, the classes-this-week line and the corner chevron have to
mean the same thing on both screens, and a second copy would drift where
nobody was looking. Neither row carries a Follow control: the pill came off
(a column of pills fighting a column of names was most of the screen
shouting), following is the profile's decision, and a row you already follow
says "· Following" quietly at the end of its sub-line instead.

`searchAll` runs on the server rather than filtering a list the page already
shipped. Discover no longer filters by text at all: its box is a door
(`.dissearch-door`), drawn like the field it opens (the placeholder span
carries the input's vertical padding, or the box collapses to one line), and
tapping it lands on `/search`, where the box already holds the caret and the
empty state offers no door back to Discover, because that would be a circle.
The header's corner carries the magnifier again (the plans ribbon's leaving
made the room), and the Discover tab went back to the compass so the same
glyph isn't drawn twice on one screen: browsing is the tab, searching is the
corner and the box. A directory has to arrive whole; a
search is a question, and sending every account to every device so the answer
can be computed there stops being reasonable well before it stops working. It
keeps two rules and they are why it can't be a plain LIKE: blocked in either
direction is not in the results, and `discoverable = false` is not either,
because that switch means delisted with the page still public and a search
that ignored it would make the setting a lie. Discover's *other* filter (a
coach needs a schedule or a bio to be worth listing) is deliberately not
applied here: that is a quality bar for a list somebody is browsing, and you
asked for this person by name. There is no separate place field for now (it
shipped and came back out; the one box already matches towns through
`users.location` and a studio's address), so a city is typed where a name
is. A tag word has to answer in every half or it answers in none:
`users.disciplines` is searched alongside the name, the handle and the title,
because it is picked from `STUDIO_TYPES`, the same vocabulary a studio's
types come from, and "kettlebell" was already finding the kettlebell gyms
and stopping short of the kettlebell coaches, which is the half somebody
typing it most wants. `certifications` stays out on purpose: a credential is
not a category, and searching free chips for a category word only works by
coincidence. The known gap is one vocabulary short of the doctrine above it:
`CLASS_TYPES` (what the adder's Type dropdown offers) is a different, shorter
list than `STUDIO_TYPES`, so a class cannot be tagged Kettlebell at all and
is only found by that word through its name or description. Merging them is
the fix and it is its own commit, because it changes a shipped picker and
Discover's two type filters read from the two lists separately.
Recent (`fl-recent-searches`, localStorage, this device only) holds the
rows that were tapped, not the strings that were typed: "iron" was only ever
a way of reaching Ironbound, and offering the half-typed guess back is
offering the work instead of the answer. Each entry is the person or place
itself and links straight there; clearing the box is what brings them back,
and Clear empties the list. Two characters
is the floor, and the number lives twice (the action and `SearchScreen`)
because a `"use server"` file can only export async functions. Each keystroke's request carries a sequence
number and only the newest may paint, or a slow "st" lands after "stacey" and
the results go backwards while you type.

**A class is searchable by its own words, and that is the answer to
"subcategories" for now.** Somebody asked to pick Yoga and then add Vinyasa
or Rocket so their class could be found by style. A field of free-text
subcategories is the `certifications`/`disciplines` split falling the wrong
way: a hundred spellings of one word and a filter nobody can use, which is
exactly why `disciplines` is a pick from `STUDIO_TYPES` rather than a box.
Coaches already write the style down, in the class's name or in their
description, so search reads it there. `classMatches()` in
`discoverclasses.ts` is the one definition of what a class matches on: its
name, its `classType` and its description, and deliberately nothing borrowed
from whoever teaches it. A class that matched its coach's name would be the
same answer twice under two headings, and People is already the heading that
answers it. The name and the type match anywhere in them and the description
only at the start of a word, which is the difference between a label and
prose: a name is short and chosen, so a substring of one is what you meant,
while in a paragraph a two-letter needle lands inside words that have nothing
to do with it. Searching "om" for a yoga studio returned every class whose
description said "room" or "welcome". The section is dated occurrences like Discover's, capped at
`CLASS_LIMIT` (40), and the fortnight it searches is the fortnight Discover
loads, because it is the same `buildDiscoverClasses` call over the same rows.
`searchAll` runs `publicSchedules` over every listable person rather than the
ones whose name matched, or a class would only be findable through its coach.
Two structural rules come with it. `ClassResults` is the shared component
both Discover's Classes half and search render, for the reason
`DirectoryRows` is shared: the ribbon has to mean the same thing on both
screens. And `groupClassDays` lives inside that component rather than beside
`DirClass`, because `discoverclasses.ts` reaches `@/db` and importing a
*value* from it into a `"use client"` file drags `pg` into the browser
bundle; the type import is erased and stays. `/search` calls `useBandTop()`
for the same reason Discover does: a `.callist` day band sticks at
`--dayband-top`, and a screen that draws one without publishing it pins the
band at a guessed offset in the middle of a row.

**A screen with the bottom bar needs the header links too.** `AppChrome`'s
`headerNav` follows `bar` by default: above 940px the bottom bar hides and
`HeaderNav` is the only navigation left, so a screen that had tabs at 390px
and none at 1280px is a dead end. The single opt-out is a profile
(`headerNav={false}`), whose header floats over a photograph in white, where a
row of ink links is a row nobody can read.

**Discover has three halves: the classes, the coaches and the places.**
Members listed alongside coaches for a while, by Matt's call, because a
directory of six coaches said the room was empty. Classes say the room is
lived-in honestly now, so the half is Coaches again and members leave it:
a coach directory half full of people who teach nothing is a worse answer
to "who can I train with" than a shorter one. Nobody is hidden by that,
which is what makes it safe: search covers both kinds, and Home's people
rail still mixes them. The Coaches rail's chips are what they teach
(`users.disciplines`), All leading filled-in, multiselect, from the same
vocabulary the studios' chips use, so one word narrows either half. The
quality bar (a schedule, or enough profile) is a coach's and always was. `discoverable = false` and blocks in either
direction still mean not listed. Studios are not followable and
never will be by this control, because you follow a person and a gym is a
place; the row is the whole link to `/s/{slug}` and carries no pill. They also
carry no city filter: a studio has a free-text `address` and nothing normalised
to group by, so searching the address is how you find a town. Studios list in
name order, not schedule-first: a directory of places shouldn't rank them by
whether they signed up, and the Schedule tag says which have a week to see.

**Nobody is listed against their wishes.** The studio dots carry "Take this
page down" (`StudioFeedback`'s `optout` mode, open to everyone signed in or
not, because the owner probably has no account): a coach adding the place
they teach is not the studio agreeing to be here, and the ask rides the same
`suggestStudioEdit` pipe as a correction with "Take this page down." as its
first line, so it lands in front of the admin unmistakably. It requires an
email and an owner/manager claim, because an ask that can't be answered or
verified can't be honoured. This is the ethos said as a button: never
addicting also means never held.

**A studio's photo is a rectangle, and that is how you tell it from a
person.** The banner (`.profbanner`, 16:9, capped at 280px tall) is the
treatment the studio page led with before the one header unified everybody,
and it came back because a place reads as a room where a person reads as a
face: a circle crops the room to a porthole, and two page kinds that looked
identical above the name were worth telling apart. It runs full bleed now,
to both edges and up under the header (`.profbanner-wrap` swallows the
page's top padding with a negative margin), with no radius and no shadow: a
photograph running edge to edge is its own frame. Verified overlays the
picture's bottom-left, above the name, on a white pill so it reads over a
photograph. The corner controls and the badge sit on the picture at the
content gutter (`:has(.profbanner)` drops them to the photo's top, left and
right 0 against the content box): the photo bleeds past the gutter, so an
inset of their own put them deeper than every row below, which read as
stray padding. A studio with no photo keeps the same
rectangle, filled with its own derived colour (`.profbanner-empty`): both
layouts are one layout, the badge overlays either, and the space is the
photo's invitation.

**A studio with no photo wears its colour, not a pin.** `avatarColor({ id })`
derives one of the same sixty colours a coach draws from, identical in the
directory row (with `initialOf(name)`) and on its own page (the colour-filled
banner). A grey placeholder pin on every row was unreadable for exactly the
reason a page of identical orange circles was. There is no
`studios.avatarColor`: a studio has no picker, so the derived colour is the
only one it can have. In the directory the shape rule holds at row size too:
`.disrow-studio .disrow-av` is a rounded rectangle where a person's stays a
circle.

**Locations are one string per place.** Discover groups by the exact value, so
`normalizeLocation` canonicalizes to "City, ST" on save and the field suggests
the cities already in use. A bare city snaps onto its only match; with two
matches it asks which, and with none it asks for the state. Adding another
place that writes `users.location` means passing `knownLocations()` in too.

**Discover's top is one stack: the search door, the halves as underline
tabs, and the chip rail under them, led by All. All three halves wear
that same rail, at the same size.** The People/Studios
segment is the same underline tabs a profile's sections wear (`.pubtabs
.distabs`), and the rail (`.dischips`, scrolling off the edge) is the whole
filter now. All leads it, filled in by default: the one selected chip is
what says the others can be selected, and tapping it clears every pick. On
Coaches the chips after it are what they teach; on Studios they are the
place's types. Both are multiselect, where picking two means either, not
both. Any pick takes All off.
The Available-for-clients chip and the discipline chips left the People
half when members joined the list; they come back the day the filters
earn a sheet. There is no Filters chip and no sheet for now; both return
the day there are enough filters (the city among them) to need one, which
is also why `cities` stays a prop the component ignores. Nothing is on by
default: a filter you didn't set is a list you can't explain.

**A filter is only offered where it can narrow something.** Discover's type
chips are built from what the lens in front of you actually holds:
`studios.types` on Studios, `users.disciplines` on Coaches, the types the
fortnight actually carries on Classes. Pooling the halves once offered the
coaches the studios' vocabulary, and every chip there filtered to nobody.
Switching lens drops the pick, since the other half can't honour a word it
doesn't use, and the rail is not drawn at all where nothing has a word yet.

**The rail is busiest first, and one size on every half.** `rankByUse` in
`DiscoverList` counts what is behind each word on the screen in front of you
(occurrences per class type, coaches per discipline, studios per type) and
orders by it. A rail is read left to right and only its first few chips are
seen without a swipe, so the ones in front are the ones with the most behind
them; alphabetical put Barre ahead of Yoga for no reason anybody could name.
The chips are the Classes filter's old 38px pill on all three halves now:
`.dischips .chip` was the base 12px `.chip` while the two class filters were
38px, and at that size a filter reads as decoration on a screen whose whole
job is finding somebody. The height is fixed rather than padded for the same
reason `.clspill`'s was: a padded chip grows the rail the moment anything in
it is taller than the line box.

**A profile carries no tab bar, and the arrow is the way off it.** Three layers
of chrome stacked at the bottom of a schedule (the bar, the floating Add class,
the pinned name and tabs) was most of a phone screen spent on furniture. The
bar comes off all three profiles, the page stops reserving its height, and the
floating button drops to where it sits on a screen with nothing under it. The
cost is real and worth saying out loud: tapping You lands you somewhere with no
bar, so the ways on from there are the arrow and the wordmark. Both go home.

**`backToFor()` in `src/lib/nav.ts` is the one table for where back goes, and
it never answers null.** A named `from` (discover, home, schedule) names the
list so the control can say which one; anything else falls back to the front
door, `/feed` signed in and `/` not. The arrow is the only way off a profile
now, so it has to be on every one of them. `BackLink`'s `anywhere` prop is what
makes that honest: it pops to whatever `pageBeneath()` reports rather than only
to a matching href, and uses the href just for a page opened cold, where
"wherever you came from" is somebody else's website. The studio page, a coach's
profile and a member's all ask this one function, which is why they answer
alike.

**A "back" control has to pop, not push.** `useSlideBack` checks `pageBeneath()`
(a small path stack kept in sessionStorage by `NavTrack`) and calls
`router.back()` when the page underneath is where the control points. Pushing
unconditionally is what trapped people between a coach page and a class page:
both link to each other, so every tap grew history and the browser button could
only walk the pile. A coach's page answers to three URLs, so compare with
`samePage()` rather than `===`.

**A profile never pops into one of its own pages.** That same coach-and-class
pair is the one able to trap somebody, and the profile's `anywhere` arrow put
it back: a class link opened cold sends you to the coach, the coach pops to
whatever is beneath, which is that class, whose own back sends you to the coach
again. Two taps, forever. `notUnder` is the answer: `ProfileTabs` passes its
own `base`, and a page underneath that lives inside this one is somewhere you
went rather than somewhere you came from, so the arrow steps over it to the
named destination. `scripts/nav-smoke.mjs` walks the trap.

**`NavTrack` learns "we went back" from `popstate`, not from the pathname.** It
used to treat landing on the page beneath the top as a back, which is wrong
exactly where it matters: tap into a class, tap the coach's name, and you
arrive at the pathname that is beneath, so a step forward was recorded as a
step back and the class fell off the stack. `popstate` fires for the browser
button, a swipe and `router.back()`, and never for a push. The old guess
survives for the first run after a document load only, because a back that
reloads the page brings up a listener that never saw the event.

**The owner's page uses the visitor's two slots.** Where somebody else sees
Message and Follow, a coach on their own page sees Share (filled) and Edit
profile (outline): the same shapes, the same weights, the same spot. Share
opens the one sheet holding every way of doing it (the story image, the link,
the QR code, the week as text), and `ProfileOwnerBar` renders that whole pair
plus its sheets, which is why it lives in `actions` rather than `ownerTop`.
This replaced a three-dot menu beside the name. Its other two rows already had
homes and kept them: adding a class is the floating button, and Requests is a
stat on the account. A lid over two buttons is where things go to be forgotten.
`.ownermore` still exists, but only on a studio page (`StudioMenu`).

**One header, three kinds of page.** `ProfileTabs` is the hero, the tab row and
the panel under it, and a coach, a member and a studio all render through it:
same photograph, same badge above the name, same two pills on the picture, same
tabs. It takes a `base` (`/matt`, or `/s/ironbound`) and a list of tabs rather
than a handle, because a studio's URL has a prefix. A member wears two tabs
now (Schedule and Info, `/{handle}` and `/{handle}/about`): the Schedule is
the classes they're going to, still gated on the mutual follow, and a
stranger's empty state says the same words whatever the week holds so it
can't be used to guess it; Info is the about, empty state and all. What used
to be three headers is one, and three headers is how a member's page ended up
looking like a lesser version of a coach's.

**A profile reads left, top to bottom, like everything under it.** The
full-bleed photo hero shipped and came back out: a screen of photograph
before any schedule said editorial when the product says calendar. Then the
centred head went too: it was the one centred block on a left-reading
screen. `.pubhead` starts everything at the gutter (face, name, one
`.profmeta` line of what and where, the two big pills), with top padding
clearing the corner circles; a studio's banner drops the padding entirely,
because the photo runs up under the header and the circles sit on it. Then the tabs as underlines: the selected one is ink over an
ink rule, the row carries the one divider, and nothing fills. They were pills
for a moment, and stacked under the action pills over the card list it was
pills on pills.
The big picture still exists one tap away: the avatar is `AvatarZoom`, which
blows the photo up over the blurred page with Follow, Share, Copy link and QR
under it (the owner gets their card there too). There is no Coach/Member/
Studio tag and no availability tag; the only badge left is a studio's
Verified, in `badges` beside the name. The share card image follows the same
rule: it wore a Coach or Member pill above the name and dropped it, because
the card is the page said as a picture. Contact is the filled pill and the
bottom sheet; Follow is the outline that turns green (`--go`) when it's a
yes, same green as a Going mark.

**Signing in puts you back where you were.** `src/lib/afterauth.ts` is one pair
of functions over one sessionStorage key: `rememberAfterAuth` on the way in,
`takeAfterAuth` once, at the end. The header pill on a profile carries
`?next=/{handle}`, `AuthFlow` reads it on mount, and whichever ending the flow
has (straight through, or three steps of the wizard) consumes it there. It is
not a query string all the way down because the way in is a sheet, a passkey
prompt and sometimes a wizard, and the first step that forgot to pass it on
would drop somebody silently. The word is "Sign in", everywhere, including the
errors: it covers coming back and arriving for the first time, and two words
for one door is two doors.

**A bottom sheet is a surface, not a tray for cards, and it is solid.**
`.sheet` is plain white (`--card`, flipping with dark mode): it tried the
class overlay's glass and the rows and their dividers went muddy against the
tint, and a sheet is a thing you read and act on, so legibility beat the hint
of the page beneath. The scrim already says where you came from. A
`.settingslist` inside one drops its own white block: rows sit straight on
the sheet and the dividers do the separating, because a white card inside a
white card is a box drawn for its own sake.

**Handing a profile on lives behind the face, not in a row of circles.**
A person's share/copy/QR actions sit under the blown-up photo in `AvatarZoom`;
a studio has no face to blow up, so `ProfileShare` (native share, copy
fallback) rides with its pills instead.

**Add class is brand orange with white words; Discover's filter stays glass.**
The one button that makes a coach's page exist gets the one loud colour, by
request, after a glass version read as furniture. The filter pill keeps the
glass: it floats over a list somebody is reading and is not the point of the
screen.

**Every studio page wears a badge, and both badges explain themselves.**
`VerifiedBadge` renders Verified or Unverified (the word alone, no "studio":
the page it sits on already says what kind of thing this is), and tapping
either opens a sheet saying what it means: Verified, that the people who run
the place keep the page, which is why nobody else can edit it; Unverified,
that the page is a shared entry the community keeps, and what verifying
would hand the owner. Both offer the same way in for somebody who runs a
studio: the Own this page sheet (`StudioFeedback`'s `claim` mode), an ask to
take the keys rather than the corrections form, requiring an email and an
owner or manager claim and riding the same `suggestStudioEdit` pipe with "I
want to own this page." as its first line, the way the opt-out marks itself.
A badge nobody can ask about is a claim taken on faith, and an absence
nobody can ask about is worse.

**On a profile the header sits above the page again, and only the name and
tabs pin.** `.pubstick` sticks under the app header, measuring the brandbar's
height on mount (a stranger has no app header, so it measures zero and owns
the top). Once the big head scrolls away it grows the small copy of the name
and the compact Follow.

**The head's two corner slots must not own a stacking layer.** `.profback`
and `.ownertop` are positioned but carry no `z-index`, on purpose. They hold
arbitrary controls, and a control that opens a sheet needs that sheet at z-46
over the z-45 tab bar; a `z-index: 2` on the slot trapped it in a layer of its
own, and the studio's dots opened an editor whose Save button could not be
tapped. This is the same trap the account view has, where the fix is to
portal instead.

**Your own profile keeps the tab bar; somebody else's has none.** Theirs is
a page you visited, and the arrow is its way off. Yours is one tap from the
You tab, and it keeps the bar so the way back stays under your thumb.
`.ownbar` is what puts the bar's room back at the bottom of the page and
lifts the floating Add class button over it.

**The Schedule tab is the calendar and nothing else; the tools live on
You.** The calendar and the identity shared one screen for a while (the
`.schedtools` rail rode across the calendar's top), and before that the You
tab pointed at the public profile and the working screen ended up behind a
gear, which was bad enough to reverse. The rule that holds both lessons: the
calendar is a top-level tab, one tap from anywhere and behind nothing, and
it carries nothing that isn't the week. The room this makes is for the
full-size calendar that is coming. The coach chip only rides the Going
rows, where the face answers whose class it is. The rows carry no corner
share circle any more; handing a class on goes through the class sheet, or
the floating Share pill for the whole week.

**You is the person, and it is the settings.** `/you` renders for both
kinds: a member's `MemberAccount` rows, a coach's `ProfileSheet` with
`page`, the same account screen that was an overlay on the schedule for
months, now in the flow of the tabs layout (`.acct-page` unfixes it; sub
-sheets still ride over the z-45 bar). The coach's screen holds the face row
into the public page, the stats, the share cards (schedule story, profile
card, QR), the invite, the settings groups, and the week-as-text copy
(`myWeekText`, a server action, because this screen holds no class rows).
There is no gear anywhere the tab bar renders: the You tab is the door, and
a second door in the corner said it twice. The one gear left is the
coaches-only mode (`AppHeader`'s `settings` prop), which has no tab bar to
hold the account; it links to `/you`. `/app?acct=1` redirects there, because
that URL was the gear's href for months and old links have to land. The
Google OAuth callback lands on `/you?gcal=...` for the same reason: the
Google Calendar row lives there, and `ProfileSheet` owns the verdict toast.
`.ownermore` means the studio page's dots; nothing on a person's profile
opens settings any more.

**Contact is a thing you do, not a section you read.** It was a tab; it is now
the pill beside Follow and one sheet (`ContactSheet`). Message on fittlist
leads it in ink, because every other row hands the conversation to somebody
else's app, where a coach loses the thread and a member loses the reply. The
rest are still offered: a coach who put their number up meant it. The pill only
appears when there is something behind it, and never on your own page, and
`users.messagesOpen` off removes the fittlist row rather than the pill, since
an email is still a way to be reached. `/{handle}/contact` permanently
redirects to the schedule after the block check, so an old link still lands
somewhere real. The predicate for "is there anything behind the pill" lives in
`PublicProfileView`, not beside the sheet: a `"use client"` module's exports
can't be called from a server component, only rendered.

**A signed-in member is never asked who they are.** `MessageComposer` drops the
name, email and phone fields when the viewer has an account, and `sendInquiry`
reads both off the session rather than the form, which is what makes dropping
them safe: a client sending its own would be sending something we already know
better. A stranger still fills them in, because a coach's reply has to reach
somebody. `MessageBar` is the same composer behind the photo overlay's Contact
bar on a member's profile, and there is no separate "Request private session"
door any more: it was the same action wearing a different heading.

**A coach's profile is a route per tab, and the bare handle is the schedule.**
The tab reads Info and the route is still `/about`: the label is what somebody
reads and "About" was a heading pretending to be a section name, while the URL
is out in the world and renaming it would break links for a word.
`/{handle}` renders Schedule and `/{handle}/about` and `/{handle}/studios` the
other two, and `/{handle}/schedule` still resolves because that link is already
out in the world. The schedule leads because it's what the link is for, and a
coach who hasn't written a bio would otherwise hand people a near-empty page.
The tabs are links, not scroll anchors. `PublicProfileView` takes a `tab` and
renders that section only; the header above it is identical on all of them,
which is why `samePage()` treats them as one screen for back controls. Adding a
section means a route, a `ProfileTab` value, a branch in the view, and
`samePage()`'s regex.

**`@media (display-mode: standalone)` is how the installed app differs from
the browser.** It matches on a home-screen launch and not in a tab, so it's the
one place to style the app as an app: the tab bar is a floating glass pill
there and stays edge-to-edge in a browser, where it would otherwise sit above
Safari's own toolbar as a second competing bar. The glass has something to blur
because the bar is fixed over a scrolling list; the bottom padding on `.pad`
only guarantees the last row can clear it. Test it with a persistent context
and `--app=`: a plain `launch()` discards that window, and CDP cannot emulate
the feature.

**The service worker caches static assets and nothing else.** Every screen is
force-dynamic and behind a session, so caching a page would serve one account's
schedule to whoever opens the app next. `public/sw.js` handles only `/fonts/*`
and the icons and lets everything else go straight to the network; it exists
mainly so Chrome will offer an install at all. Bump `VERSION` when the shell
list changes. Icons are generated by `npx tsx scripts/make-icons.mjs`
from `brandIcon()` and committed, favicon included, so the home screen and the
header can't drift. Run it only when the mark changes.

**Stacking contexts.** As an overlay (the coaches-only mode) the account view
is a positioned `z-40` layer and the tab bar is `z-45`, so a sheet rendered
inside it sits *under* the bar and its bottom button can't be tapped. Portal
such sheets to `document.body` (see `InviteFriends.tsx`). As the You tab
(`.acct-page`) the wrapper is static and makes no stacking context, so sheets
get their natural z-46 over the bar; the portal stays because it has to work
in both skins.

**Tapping Follow says what just happened, but only for a coach.** A follow shows
`FollowHint`: a bar reading that their classes are on your Following week, a
link straight to it, and a Don't show again that means it. Following a *member*
shows nothing, because the bar would be promising a week they don't have: what
that follow buys is quiet and mutual, and until it can be said in a sentence it
says nothing. It renders from the profile pill
(`NotifyCta`), which is the only Follow control left now that the directory
rows carry none, and a button whose effect is invisible teaches nobody what
the app is for. The dismissal is localStorage (`fl-follow-hint`), which is
per-device and unlike the invites banner's column on the account; a column is
the fix if that starts to matter.

**The invites banner is announced once, then never again.**
`invitesBannerCount()` returns 0 unless the beta gate is up, they're onboarded,
they have invites left, and they haven't closed it. The dismissal is
`users.invites_banner_at`, on the account rather than in localStorage, so
swatting it on a phone also clears it on a laptop. `InviteSheet` is exported
separately from `InviteFriends` so the banner and the settings row open the
same sheet; the success toast belongs to whoever opened it, because a toast
rendered inside the sheet unmounts with it and is never seen.

**The feedback prompt is modal, and "shown" counts as "asked".**
`feedbackPromptDue()` gates it: onboarded, `FEEDBACK_PROMPT_AFTER_DAYS` old
(3 by default, 0 in the suite), never written in, not asked in the last 60
days. It renders in the tabs layout and on `/app`, over whatever is there, so
a test that clicks through an account old enough to qualify has to dismiss it
first.

**An unknown icon name renders a plain circle.** `Icon` falls back to Lucide's
`Circle` rather than throwing, so a typo or a name that was never mapped ships
as a blank button and nothing complains. Add the name to `ICONS` in
`src/components/Icon.tsx` when you add the call site. Names reached through a
lookup table (`ICON[n.type]` in `UpdatesScreen`) hide from any audit that only
greps literal `<Icon name="...">`, which is how every notification row rendered
a blank circle for months.

**Public classes are coach-only, and a member's own classes are private by
construction.** Beta members recreated their gyms' real classes because it was
the only way to get their week into the app, so `publishClasses` now refuses a
public class from a `kind === "fan"` account, and members get
`personal_classes` instead, living only in their own week. There is
deliberately no column that could make one public, so the wall can't be left
open. Becoming a coach is an
ask, not a switch: `requestCoaching` files it, the admin's People tab answers
it, and `adminSetKind`/`adminAnswerCoachRequest` are the only things that flip
`users.kind`. The named coach is an
invite lead ("Is Jenny on fittlist?"), not a users reference: naming your
coach is not putting them on the platform. The admin Reports tab lists
same-studio-same-time classes under two accounts, which is what the old leak
looks like from above.

**Publishing a class ends on the share moment.** A brand new public class
closes the Adder onto `ClassLiveSheet`: the class is live, and the two ways
to hand it on sit right there instead of a hunt through menus later. They
are both "share" and they are different acts, so the rows say the
difference: Share the link (the class URL, to a person, anywhere you
message) and Share a picture (the class card, `ShareCardSheet`, for a story
or a post). Only a brand new public coach class earns it: an edit is not
news, a private class has no page to hand anyone, and gym and personal rows
have their own flows. `save()` returns the first inserted row's `id` so the
sheet can point at the class without a second lookup, and the suites close
the sheet through their `closeLive` helpers after every publish it rides.

**A class you go to is filled in with the same form as a class you teach.**
It was five fields in a sheet of its own, so the thing you booked through
ClassPass arrived with no studio, no description and no picture, and the next
person to add it got none of that either. `Adder` takes a `personal` prop now
and `personal_classes` carries what `classes` carries (studio, type,
description, image, links, a one-off `specificDate` or a weekly slot with
`endsOn`), field for field, so `runsOn` reads one without translation. What it
still has no column for is being published.

**One of your own writes your own catalog, so the second one is a tap.**
The people this is for have schedules that are all over the place and
still repeat: ten clients, ten places, every week. `addPersonalClass` and
`updatePersonalClass` upsert a `class_templates` row the same way
publishing does (one per `(userId, name)`, latest wins), with
`isPublic: false`, which is what that column on that table has always
meant: yours, on your own schedule, on nobody's public page. Typing
"Training with Kia" a second time offers it back under Yours, ahead of
the studio's shared rows and winning the name outright, and filling it
brings the place, the description, the length, the time and who it's with
(`class_templates.withWho`, the one column this needed: the entry has it
and the memory would be a worse memory without it). The studio catalog
cannot serve this case at all, because a 1:1 at a client's home has no
studio to have a catalog. This is the seam the private-training side will
be built on when it is asked for: a client following one calendar,
booking and cancelling against it. Not yet, and nothing here assumes it.

Two things travel out of that table and nothing else does. The class joins the
studio's shared catalog, so the next person gets the details and a studio
that isn't here yet arrives in the directory with a real class on it; and that
write only happens **when a studio was picked**, because "Powerflow has a
Vinyasa at six" is a fact about the studio while a 1:1 in somebody's garage is
not. Nothing rendered anywhere says who wrote a catalog row. The form says so
out loud under the studio field, which is the consent. The coach path keeps
its own version of this rule by refusing to log a private session at all.

**A coach adding to their calendar is asked which hat, by the plus.** Both
are true for them: the class at their own gym might be theirs to teach. The
sheet behind `.fab-plus` asks first and passes `personal.canCoach: false` to
the form, so the Adder's in-form chair question (which still exists for any
caller that doesn't pre-answer) never shows twice. "Going to" writes a
personal row; "coaching" opens the publishing form, toggle and all. A member
is never asked: one answer is not a question.

**The admin can put a picture on any class, and only a picture.**
`adminSetClassImage` (behind `currentAdmin()`) writes `classes.image` for
every class with that title under the same owner, not just the tapped series:
a coach teaching the same class at two studios has two series that are one
class, and a photo on one left its twin bare. It also lands on the owner's
`class_templates` row (so re-adding the class brings the picture back) and on
each touched studio's `studio_classes` row, so the next person to pull the
class in gets it. It stops at the owner, because two coaches can both teach a
"Yoga Flow" that are different classes. Remove clears all of the same rows,
or the old picture comes straight back on the next catalog pull. The door is the class sheet's overflow menu, admin only
(`classDetail().adminPhoto`), offering add, change and remove. It is a
beta-era power for filling in a catalog typed before pictures existed, and it
deliberately cannot reach a word of anybody's class: times, names and
descriptions stay the coach's own. `adminSetClassLink` is the same power for
the booking door, with one harder rule: fill-the-blanks only. It writes a
link (labelled by `detectProvider`) onto the same-title classes and the
owner's template, and only where the links array is empty, because a link
the coach set is their word. The door (`classDetail().adminLink`, in the
sheet's overflow) only exists where the blank does.

**A class report points at the `seriesId`, not a class row.** `class_reports`
is how someone flags a class that isn't right, and a report keyed on a class
row would hit the same wall as a Going mark: edits delete and reinsert rows.
The series survives an edit, has no table and so no foreign key, and is what a
person means by "this class" anyway. The cost is two denormalised columns
(`coach_user_id`, `reporter_user_id`), both users FKs, both cleared in
`adminDeleteUser`. Reports on a deleted class keep rendering in `/admin` as "A
deleted class", which is on purpose: the report is still a fact about a coach.

**A gym's class belongs to the gym, not to whoever is teaching it.** This is
the one inversion the rota rests on. `studios.accountUserId` points at a `users`
row with `kind = "gym"`: no handle, no password, nobody signs into it, and it
exists so a gym's classes have an owner that isn't a person.
`classes.coachUserId` is then the rota, driving the shift, the notice and the
calendar. That split is what lets a gym publish a week without naming anybody
(a schedule is not a popularity contest) and a coach take shifts without
wanting a public profile at all. Whether a coach's name is ever shown is a
separate question with two people's say in it, and the more private setting
wins. A shift is work, not a listing: by default it stays out of the coach's
public page and their public `.ics`, and lands in the private token feed
instead.

**`users.shiftsPublic` is the coach's own answer, and `publicSchedules()` is
the only place it's read.** Default off, so nothing changed for anybody who
had a page before gyms existed. On, the shifts a gym has them on join their own
classes everywhere their public week appears: the page, the public `.ics`, the
story and card images, Share my week as text, Following, Discover's count, and
both digests. That list is why there is one loader (`src/lib/coachweek.ts`) and
not a query per surface: a coach whose page says Thursday and whose digest
doesn't is worse than one that says neither. It is also a different question
from whether the *gym's* schedule names anybody, which is the gym's call and
stays off; this switch never touches it.

Two things make the loader the whole answer rather than half of it. Covers are
folded into the rows before they're returned, a date somebody else took
becoming a `skipDate` and a date handed over becoming a one-off pinned to it, so
`runsOn` stays the only predicate a caller needs and no surface has to learn
what a swap is. And a shift is owned by the gym, so the row carries
`ownerUserId` (whose schedule it belongs on, never `userId`) and its page lives
under the studio: `classAddress()` returns the `base` for the href and the
`key` `classDetail()` looks the owner up by, because conflating those two is
how a link 404s. A row can name its own base with `data-base`, which is how
`ClassOpener` opens a shift under the gym from a coach's page.

**The coach listed it first, and that is every gym's first day.** Coaches put
their Ironbound classes on fittlist long before Ironbound had a page, so the
moment a manager lists the same slot there are two of the same class.
`publicSchedules()` pairs them and drops the coach's: the gym runs its own
schedule now, so the gym's row is the one people see, and nobody is looking at
a double listing while it gets sorted out. `mySchedule()` keeps both and tags
theirs Duplicate, because their own screen is the only place they can act on it.

The pairing is name, day, time and studio, per coach. Day, time and studio
alone is what the overlap notice uses, and it is right for a notice and wrong
here: two rooms at six o'clock would pair the yoga with the spin, and a wrong
pair takes a real class off somebody's page. A name that doesn't quite match
just leaves the duplicate standing, which costs nothing.

`mergeIntoGym()` is the cleanup and it belongs to the coach, not the manager: it
is their row, on their page, carrying their followers' Going marks. Deleting it
through the adder would be wrong twice, telling everyone who saved it that the
class was cancelled when it plainly wasn't, and losing them their spot. The
marks from today forward move onto the gym's row first. Assigning a coach who
already lists the slot tells them, once per slot, keyed on the notification body
the same way the overlap notice is.

**On their own screen the switch never applies.** `/app` asks `mySchedule()`,
which always folds shifts in: `shiftsPublic` answers "does anyone else see
these", and a coach who is on Thursday at seven has to be able to see that they
are on Thursday at seven. The row wears a Shift tag and opens the class rather
than the adder, because it is the gym's to edit. Google Calendar sync is still
out: the token feed already carries shifts, and syncing them too would double
them for anyone using both.

**A coach works their own half of the rota, and the manager only hears about
it.** `giveUpShift`, `claimShift` and `sendShiftTo` in `gym.ts` are the
coach-side set, and unlike everything else there they run on a session rather
than `actingFor()`: giving up or handing on needs only that you are the one on
that date, taking needs only that you coach at that studio. All write the same
`shift_covers` row a manager's `setShiftCover` would, so a swap is a swap
however it happened. Handing a date back opens the slot (`coachUserId` null)
and tells the managers **and** every coach at the studio, because a dropped
class needs a taker and that notice is what the lost text message was for;
taking one tells the managers only, since everyone else was told so that one
of them would do exactly this. Handing a date *to* somebody writes the cover
straight onto them and tells them and the managers: the swap was agreed over
the counter, and this is the writing-down. All of it is a notice, not a
request: nobody asks permission, and nobody finds out too late.

**Who a shift can be handed to is the gym's list, not the directory's.**
Anyone may say they coach at a gym (the directory runs on trust), and not
everyone listed teaches the group classes, so `studio_rota_coaches` is the
managers naming the pool: the Shift list sheet on the rota screen
(`rotaPool`/`setRotaCoach`, manager-only) toggles coaches from the same union
`gymCoaches` offers. `sendShiftTo` refuses anyone not on it, and
`classDetail().shift.sendable` is that list minus the viewer, so the sheet
and the action can't disagree. An empty list just leaves the hand-back. Both
directions clear in `adminDeleteUser`, and `adminDeleteStudio` clears the
studio's rows.

On the class itself, a coach's own shift puts Manage shift on the floating
pill (the spot a member's Book and Add live, because the date is theirs to
manage, not to book) and a sheet behind it holds two rows: Give up this
shift, and one Transfer shift door that opens the gym's list as a second
sheet, because eight names under one verb read as eight options. The
Transfer row only exists when the list has somebody on it, and the old boxed
"I can't make this one" CTA is gone. Both acts confirm first (the same
`.confirmsheet` shape removing a plan uses: what happens, the doing button,
Keep it), because the notice goes out the moment they run and a single tap
was texting the whole gym. An open slot
seen by a coach here keeps the box ("Open shift", I'll take it). All of it is
offered by `classDetail().shift`, which is null for anyone it means nothing
to. A member sees no trace of the rota, and no name: whether a coach is
listed is still the gym's switch.

**A gym is a place, not a face.** `classDetail` returns `ownerIsGym`, and the
sheet drops the "Coached by" row entirely for one: the gym has no page at
`/{handle}` to tap through to, and nobody is coached by a company. The studio
row underneath already says where. `canAdd` is false for the coach on the rota
too (`c.coachUserId === viewerId`), because `setGoing` refuses it and a button
that fails is worse than no button.

One row is one slot, mirroring the spreadsheet's one cell per class, so
`updateGymClass` edits in place and a Going mark or a swap on it is never at
risk. Nothing on the gym path deletes and reinserts a class row the way a
coach's `save()` does, which is what keeps `shift_covers` safe. The
gym account is excluded from the admin's people counts and has no handle, which
is also what keeps it out of Discover; `adminDeleteUser` refuses it outright and
clears a departing coach's `coachUserId` so their slots reopen rather than
vanishing. `scripts/gym-smoke.mjs` walks the whole path.

**A gym's class carries what a coach's does, because it is the same form.**
`GymRota` renders `Adder`, the coach's own adder, with a `gym` prop rather than
a parallel sheet of its own: two forms asking for the same things is how they
drift, and the gym's copy had already fallen a step behind (no second day, no
end date, no one-off). What the prop changes is only what has to. The studio is
the gym's and is never asked for, the public/private toggle is gone because a
gym's schedule is what it publishes, and one field is added: `coachUserId`, the
rota. `gymCatalog()` fills the name field's existing autocomplete, so a manager
pulls in a class already described at that studio rather than retyping it, and
saving writes back to `studio_classes` so the description stays the same
wherever it appears. Links come along here, unlike a coach reusing another
coach's class: a gym pulling in its own studio's booking page is the same page
either way.

The one place gym mode diverges from the form's own behaviour is the day pills
on an edit, and it follows from one row being one slot: picking several days on
a *new* class makes several slots (sharing a `seriesId`, each with its own
person on it), but editing an existing one moves the slot rather than fanning it
out, so the pills go single-select. That is also why a gym's delete offers this
date off or the slot gone, and never "all the days it runs": a slot runs on one.
A `shift_covers` row for a future date the class no longer runs is cleared on
that move; past ones are left alone, because they are exactly what `freezePast`
wrote down.

**Counts are derived from the rota, and the past has to be frozen.**
`gymCounts()` counts every date a slot runs (`runsOn`, the same predicate as
everywhere) with covers laid over, split into month halves to match a
semi-monthly pay run. It is a count and an export: no rates, no pay periods,
nothing that is itself a pay record. Two things make the number honest. A
standing slot has no start date, so counting is bounded by `classes.createdAt`
or a class added today claims every Thursday last year. And changing the
standing coach would silently rewrite history, so `freezePast()` writes an
explicit cover for every date already run before the assignment moves; a null
old coach is written too, or assigning somebody today credits them with every
week the slot ran open.

**A swap is one date, not a change to the class.** `classes.coachUserId` is
who normally teaches a slot; `shift_covers` is the exception for a single date,
and it wins over the class for that date. Writing a swap onto the class row
would rewrite every week, which is the mistake the spreadsheet makes by having
nowhere else to put it. `coachUserId` null on a cover is the open state said out
loud: the slot runs and nobody is on it. Putting the regular coach back deletes
the row rather than storing a no-op, so the table only ever holds real
exceptions. A cover has to reach **both** calendars, or two people turn up or
nobody does: the private feed adds the covered dates to the regular coach's
EXDATE list and emits a one-off event for whoever took it. The rota screen is a
real dated week (`?w=` offsets from this Monday) because a swap is about a date.

**Every studio page wears the same three tabs: Schedule, Info, Coaches.**
`/s/{slug}` is the schedule, `/s/{slug}/about` the categories and the words,
`/s/{slug}/coaches` whoever teaches there (the same union "Where I coach"
uses, from the other end); `/s/{slug}/schedule` resolves too, and
`/s/{slug}/contact` permanently redirects onto the page, because contact
became the header pill and a sheet here exactly as it did for a coach. The
sheet carries no fittlist row: a studio has no account to be written to, so
`ContactSheet` takes an optional handle and `canMessage` false. What kind of
place it is (`studios.types`) is the first thing in Info, where it answers
"is this for me". The schedule leads for the same reason it does on a
coach's page: it's what the link is for, and on a studio with nothing
listed its empty state is the pitch. The tabs are there whatever the studio
holds (the single sectioned page for directory-only rows is gone): one
layout to learn, however small the place. `samePage()` collapses all the
suffixes, so back pops. A gym's class lives at `/s/{slug}/{classId}`,
because its account has no handle; `classDetail()` takes a handle **or** a
studio slug and scopes the lookup either way.

**A handle is not "has a page you can link to".** `week.ts` dropped any saved
class whose owner had no handle, which silently emptied a member's plans of
every gym class the moment gyms existed. Anything building a class URL wants
the base (`handle`, or `s/{slug}` for a gym), not the handle.

**An unclaimed studio's schedule is built by the commons too.** The page
draws a seven-day week from the public classes coaches list there and from
members' personal entries that named the studio (`community` in
`StudioView`), deduped on name and time, coach rows first because they have
real pages to open. A member's entry surfaces as a plain row: name, time,
length, no link, and never one word about the member; the consent is the
line under the personal adder's studio field, which says exactly this. The
week explains itself from an info dot beside the Schedule tab
(`CommunityNote`, rendered through `TabDef.info` as a sibling of the tab
link, never inside it): the sheet says the page is built by the people who
train here and carries the same Own this page ask the badge's sheet does.
It was a paragraph over the list (`.commnote`), read once and scrolled past
forever after. The moment the studio is
claimed the community week is gone: from then on what the page says is
theirs to say, and a gym account replaces it with the real rota. This is
the inventory building itself, and it is also the pitch: a studio arriving
finds its page already worth keeping.

**A manager's own studio page carries one floating door: Studio admin.**
`StudioAdminSheet` sits where a member's Book and a coach's plus live,
because on your own gym's page the thing you came to do is run the place.
The sheet holds the rota, Shifts worked, the studio editor, the share, and
the page's view count; the rows that need the gym account only appear once
it exists. Views are tracked against `studios.accountUserId` through the
same `page_visits` rollup a coach's page uses (main landing only, no
managers, no bots, recorded in `/s/[slug]/page.tsx`), so the number means
the same thing everywhere it appears. The old "The schedule" pill in the
actions row is gone: it was one door of several.

**A studio is the commons until somebody claims it.** The directory has always
run on trust: any coach can correct any entry, because a row nobody owns is
better kept right by the people who teach there than left wrong. One
`studio_managers` row changes that. From the first manager on, the studio is
claimed: only its managers (and `currentAdmin()`, who must be able to fix a gym
that locks itself out) may edit, everyone else gets the Suggest an edit door
they already had, and the page says "Verified" so the missing pencil
has a reason. `studioAccess()` in `src/lib/studioaccess.ts` is the one answer
both the page and `updateStudio` ask, so the button and the action can't
disagree. It's a join table rather than a column because a gym is a place of
work with more than one person running it: an owner and a manager both hold
keys, and either one leaving must not lock the other out. The last key leaving
returns the page to the commons, which is also what `adminDeleteUser` does with
a departing manager's row.

**Adding a users foreign key means editing `adminDeleteUser`.** It deletes rows
the account owns and de-attributes shared ones, in an order the foreign keys
allow; a new reference that isn't listed there makes deleting any user fail
outright. `notifications.actor_user_id` is de-attributed rather than deleted,
so "someone followed your schedule" survives its subject leaving.

**On desktop the header belongs to the window, and the column belongs to the
reading.** Above 940px `.brandbar` bleeds to both window edges and sits its
contents 64px in from them, in both shells (`.screen.hasnav` and `.appshell`)
off one rule: wordmark hard left, the search and bell hard right, the tab
links centred. It used to pad back to the 660px column, which put the whole
lockup in a huddle in the middle of a 1440px screen with the rule running out
past it on both sides, and a header that lines up with the paragraph width is
a header pretending to be content. The links are absolutely centred rather
than left to `space-between`: the wordmark and the icon cluster are different
widths, so with three flex children the middle one is only ever centred by
accident. Absolute is safe because the bar is sticky and so a containing
block, and because the three never meet (at 940px the sides take about 240px
of the 812px between the paddings). Below the breakpoint nothing changes: the
links are `display: none`, the nav goes back to `static`, and the bar keeps
the page's own 18px gutter.

**Desktop chrome is pointer-gated, not width-gated.** The bottom bar hides at
940px and `HeaderNav` takes over; the coach-rail arrows key off
`(hover: hover) and (pointer: fine)`, because "can't swipe" is a property of
the pointer and a width breakpoint would put arrows on a tablet.

**Location is required, everywhere it's asked.** The setup wizard won't finish
without one (Skip lands on that step instead), and `updateProfile` rejects an
empty one. It only touches the column when the caller passes it, though:
passing means the form showed the field, omitting means the form was about
something else. That distinction is load-bearing, because saving contact info
used to write `location: null` and quietly clear the coach's city.

**`updateProfile` only writes the optional fields a caller actually passes.**
`location`, `certifications`, `highlights` and `availability` are all guarded on
`!== undefined`. The last three were not, and `updateProfile` runs from three
different screens, so saving Contact info wiped a coach's certifications, their
What to Expect list, and their availability, which also took the Request private
session button off their public page. Any field a single screen owns needs the
same guard, or the screen that doesn't show it will erase it.

**Availability and Messages are two switches, not one.** `users.availability`
(`"accepting"` / `"waitlist"` / null) is a status: are you taking private
clients, shown as a pill on your page. `users.messages_open` decides whether
anyone can write to you at all, and it is what gates the Message pill in the
profile header and the Request private session button under Contact. A coach
whose books are full still wants the question about Tuesday's class, so "full"
must not mean "unreachable".

**A class can carry a picture, and it is the thing the share card is made of.**
`classes.image` is a small data URL like every other photo here, optional
forever, and it rides along on `class_templates` and `studio_classes` too: a
picture belongs to the class rather than to whoever wrote it down first, so
pulling a class in from the studio's catalog brings it. Every picker in the app
resizes through `readPhoto` in `src/lib/photo.ts` now. There were four copies of
that routine and a class photo would have been the fifth; four copies of the
thing that decides how big every image in the database is, drifting apart, is
how one screen starts storing megabytes. The member editor is the one that
stays its own: it centre-crops to a square because a member's picture is only
ever shown in a circle.

**One card sheet, two subjects.** `ShareCardSheet` takes a route and its words
rather than a handle, so `/api/card/{handle}` and `/api/card/class/{classId}`
share the theme picker, the share-a-file dance and the download fallback. The
class card leads with the photo behind the same two scrims a profile wears, and
falls back to the owner's `avatarColor` without one, so a class with no picture
still makes something worth sending. Satori lays an absolute child out against
the **padding** box, so the frame carries no padding and the content column
inside it does: a picture inset by the padding and still 1080 wide hangs off
the edge.

**A class opens as a sheet from a list, and as a page from a link.**
`ClassSheet` pulls up over whatever list you tapped, so adding reads as picking
something up rather than going somewhere; `/{handle}/{classId}` stays because a
link someone was sent has to open something real, and the sheet's Share button
points at exactly that. A server-rendered list keeps real `href`s and wraps in
`ClassOpener`, which catches the ordinary tap and lets a modified click through.
`classDetail()` is the one loader both use, so the occurrence rule (`?d=`, then
the next date it runs) can't drift between them.

**The class overlay scrolls inside a layer, never on itself.** The overlay's
backdrop blur makes it the containing block for every `position: fixed`
descendant, so when the overlay was its own scroller, the back and share
circles and the bottom pill all rode away with the content. The scroll lives
in `.classoverlay-scroll` now (ClassSheet and PlanSheet both), and the fixed
chrome stays put, which is what "floating" meant. The class photo runs to the
very top edge of the screen (`.classoverlay-img` swallows the body's top
padding and the safe area with a negative margin), and the circles sit on the
picture rather than in a band of paper above it. While any overlay or bottom
sheet is up, `ScrollLock` freezes the page behind it (`body.sheet-open`,
watching `.sheet-scrim`, `.classoverlay` and `.avoverlay`): a background that
scrolls under an overlay breaks sticky footers and loses the list you came
from.

**The word is "add", never "save".** A class goes into your plans, the pill
says Add, the note says Added, and the row that offers the calendar feed says
"the classes you added". "Saved" is what a form does and what happens to an
image, and using it for a class made the list sound like a folder rather than
a plan.

**The control that puts a class in your plans is a ribbon, not a heart.**
A heart says favourite and means "I like this"; the tap puts the class on a
list called Plans, and the glyph is the bookmark ribbon, because the ribbon is
the one mark everybody already reads as "keep this". It was a calendar for a
week, which said the right thing to nobody at a glance. The word stays Add
(never save; see below), the pill is an empty ribbon that fills in solid, and
the sheet's pill, the card's corner button and the swipe all wear the same
pair, because one idea gets one glyph.

`bookmark_added` in `Icon.tsx` is hand-drawn: the filled ribbon carried a
tick cut out of it for a while (the same evenodd-hole construction
`event_added` still uses), and the tick came off, because solid against the
outline at rest already says in or out and the hole was one mark too many
at row size. Still one `currentColor` path, so it reads on the dark pill,
the card and the tab bar alike.

**The ribbon on a row carries its word.** A glyph alone is a mark people
have to be taught, and the one action the whole member side turns on cannot
be the thing nobody recognises: the row now reads an outline ribbon and
Add, filling to a solid ribbon and Added on the tap. It is the label that
changes as well as the fill, because Add is an offer and Added is a state,
and the note that answers already says the same word. The cost is a word
repeated down a long list, and it is worth it while nobody has learned the
mark; when everybody has, the word is what comes off, not the glyph.
`.evcard-add` is an auto-width hit area rather than a fixed circle, and the
row's first line reserves room for it (`:has(.evcard-add)` on the coach chip
and on a bare `.ps-enm`, which is what a gym's row leads with, since a gym
has no coach to name). The gate matters: a coach's own teaching rows carry
no such button and must not reserve the space. The spoken name contains the
visible one on all three call sites ("Added to your plans", not "In your
plans"), or saying "click Added" reaches nothing.

**Every schedule is the same flat row now.** Following (`.feedagenda`),
both calendars, a coach's public page and a studio's page (`.callist`)
strip the card skin from the shared `.ps-event` row: transparent ground, a
hairline under each row, a rule under each date heading, and the bar down
the left carrying the colour that matters there (the coach's own on
Following and their public page, the same one their avatar's ring wears
when picked on the strip via `--avring`, with the All circle ringing in
ink; the kind's on the calendars; the studio's derived colour on its own
page). The row is bottom-aligned: the name and location sit on the
duration's shelf, however many lines each side carries. Whose a row is
rides its own line above the name (`.ps-shifttop`), the spot the coach
chip takes on a Going row: Shift in the brand wash (`.ps-tag-shift`,
`--si-tint` under `--si-ink`), Added by you on personal rows in the
personal slate's wash with ink text (`.ps-tag-added`), each tag wearing
its kind's colour quietly enough that the name stays loudest. The Add
ribbon rides the top-right corner as the bare glyph (no circle: the
button's box is only the hit area), sitting level with the coach chip's
line, and fills in ink when the class is in; the
member's remove X takes that corner on their week. Both are
siblings of the row, never children, because a button inside a link is not
a thing. The share circle came off every row (sharing lives on the class
sheet, where one class has the whole screen), so the ribbon is a row's one
action. On your own schedule a Going row wears the filled ribbon too, and
tapping it removes the class, with Undo in the toast rather than a
confirm: the way back is cheaper than the question. On the public page the pair loads the viewer's marks server-side so
the ribbon starts right; a photo per row was tried and read as a poster
wall, so the overlay and the share card keep the photo, where one class
has the whole screen. The public page's rows name the coach above the
class, redundant on purpose (the header already says who), so the row is
Following's row exactly. The `.evcards` card skin has no schedule left to
dress (the rota keeps its own dense rows: a working surface where density
is the point).

**A day is a band, and it wins on the opposite axis to the class names under
it.** The heading used to be the same visual species as the classes it
introduced: large, bold, dark, left-aligned, the same weight. A heading that
competes on the axis its own contents own doesn't read as a level above
them, it reads as another entry, and making it bigger only sharpens the
fight. So `DayBand` (`src/components/Agenda.tsx`) goes the other way: small,
wide-tracked, uppercase, the day name left and the date right
(`dayBandParts` in `format.ts`, which is where Today and Tomorrow are
decided). Splitting them is what keeps the right-hand column aligned down a
long scroll, and it is why the calendars carry no em dash.

The band is `--card`, not a darker cream. A strip a step darker than the
page sinks into it and turns the list earthy, which is the drab answer; this
one lifts off instead. It also stays out of the colour doctrine's way: the
brand orange, the green and the blue already mean teaching, going and
personal, and a band tinted any of them would be a fourth claim on a taken
meaning. Today's name in `--si` is the list's one spot of brand.

It pins wherever the list scrolls under chrome: both calendars, Following and
Discover's Classes half (`.callist` and `.feedagenda`, `top:
var(--dayband-top)`). `publishBandTop` is the single writer of that number
and `useBandTop` the only way to keep it current, watched with a
`ResizeObserver` because both the header and the chrome change height with
the view. A calendar passes its own pinned block (`CalSticky`); Following and
Discover pass nothing, because everything above their lists scrolls away and
only the app header is left. Sticky is bounded by the day group, so the last
band lets go at the end of its own day instead of riding the scroll to the
bottom. A profile and a studio page (`.pub`) have their own pinned name row
and set it back to `static`.

**Every screen that renders sticky bands has to call `useBandTop()`**, and
this is the trap: the variable lives on `documentElement`, so a screen that
doesn't set it inherits whatever the last screen did, and the CSS fallback
is a guess. Discover shipped without the call and its bands pinned halfway
down the phone, through the middle of a class row. A new list that wears
`.callist` and forgets this looks broken in exactly that way.

The scroll landings key off the same measured number
(`.callist .ps-daygroup` and `.monthblock` both take `--dayband-top` plus
8px). They were hardcoded at 165 and 190, and the header has changed height
twice since, each time leaving a gap over whatever Today landed on. A
constant that has to track a measured thing is a constant that will be
wrong again.

The band bleeds by 18px, the same pull `.calsticky` uses directly above it,
and deliberately not by the page gutter: the list's wrapper keeps its 18px
at the desktop breakpoint while `.pad` widens to 38, so bleeding by the
gutter ran the band 20px past the column on each side.

The band says the day and its date on the left and how many classes on the
right: "TODAY — AUG 5" against "2 classes". The relative words lead their
date rather than replacing it (`dayBandLabel`, which `fmtDayHeaderRel` now
just calls, so a heading and a band can't word one day differently); "Today"
alone made somebody work out which date they were looking at while every
other heading in the app was already saying one. That dash is the date
label's own, the same exemption `fmtDayHeader` carries, and it needs the
`check-copy-ignore` pragma or the build fails.

`AgendaDay.label` is the casualty and is now written everywhere and read
nowhere. Removing it touches eight files and is its own commit; until then,
editing it changes nothing on screen.

**"See it" points at the class it means.** The note that answers an add
offers a way to the week it joined, and a week is a long list: arriving at
the top of it and hunting for the row you just added is the work the note was
meant to save. The link carries `?hl={classId}.{iso}` and `HighlightOnLand`
lights that occurrence for three seconds and scrolls it into view. It works
off the DOM (`data-cid`/`data-d`, which the rows already carry for
ClassOpener) rather than threading state through the list, because the
highlight is a moment rather than something the week owns. Two things it
learned the hard way: the row is not painted on the first frame after a
client-side tap, so it waits for the row and gives up after four seconds
rather than checking once; and a coach's calendar builds its own markup, so
those rows had to be given the two keys or the highlight went blind on
`/app`. The `/week` route carries `hl` through its redirect to `/app` for the
same reason.

**The note no longer offers the private option, by Matt's call.** This
reverses the rule above it: the moment of marking was where the choice lived,
and now nothing offers it. `setGoingVisibility` still exists and
`attendances.isPublic` still means what it meant, but no surface calls it, so
a mark is public to your followers with no way off. That is a gap rather than
a decision that has landed somewhere: the setting needs a home (the class
sheet's own row, or Privacy and reach) before this can be called finished.

**One class row, on every list of them.** `src/components/Agenda.tsx` is the
day headings, the `.ps-erow` wrapper and the `.ps-event` row itself, and both
Following and Your plans render it. They had drifted into two designs for one
idea: a card with the coach's face and the time down the right on one tab, a
flat sub-line with no face at all on the other, and a member flipping between
them was reading two apps. What wraps a row still differs, which is why the
caller passes a render function rather than a flag: Following wraps it in
`SwipeGoing`, Your plans puts the remove X beside it. The X is a sibling and
not a child because a button inside a link is not a thing.

**One of your own can be opened, changed and handed on as a picture.** A
personal class had no page behind it and so no way in at all: a row somebody
had typed out in full was grey text they could only delete. `PlanSheet` wears
the class overlay (same gesture, same kind of row, so they ought to feel alike)
and offers the two things there are: `Adder` again with `personal.editId` set,
and the same `ShareCardSheet` a public class uses, pointed at
`/api/card/plan/{id}`. That route is the one thing that can leave, and it
leaves as a file: it is drawn only behind the owner's session, there is no URL
anyone else can open, and posting the picture afterwards is theirs to decide,
which is the same deal as a photo out of the camera roll. The card itself is
drawn in `src/lib/cardimage.tsx` rather than in either route, because a coach's
class and one of your own make the same picture from a different row.

An edit is one row moving, not a set being rewritten: `updatePersonalClass`
takes the first day picked and the pills go single-select, the same way a gym's
rota slot behaves and for the same reason. Nothing points at a personal row the
way a Going mark points at a class, so there is no delete-and-reinsert here.

**Schedule is everybody's calendar, and the rows say which hat.** A coach's
is `/app` and a member's is `/week`, and both hold everything the person is
actually doing: the classes they teach, the shifts a gym has them on, the
classes they added, and their own private entries, one day list in time
order. `myWeek()` in `src/lib/week.ts` is the added-and-own half for both
(weekly personal entries expand across a nine-week horizon now, because a
recurring entry that only showed its next date read as a class that
stopped); `mySchedule()` is the coaching half. The calendar pages pass
`myWeek` a `pastDays` window (`CAL_PAST_DAYS` in `format.ts`, eight weeks)
so the scroll back in time has data under it; every other caller takes the
default of none, which is why the share poster's starting day stays a
future one. Every row wears its
relationship as its colour (see the colour doctrine below), and tapping
does what the row is (a teaching row opens the editor, a shift or a Going
row opens the class sheet, a personal row opens `PlanSheet`). The List view
holds only what is real: no empty days, no time gutter, and no View more:
it runs the whole horizon its data covers (nine weeks, which is what
`myWeek` expands personal entries across, so both halves of the calendar
agree how far forward goes). A calendar you have to ask for more of is a
calendar you fight. It still stretches past that silently when a day
tapped in the Month grid lies beyond it. The public profile keeps its
View more, because a stranger's page is a pitch rather than a tool. Following is
everyone you follow; Schedule is you. Those stay legibly different.

**An empty calendar has no chrome at all.** `CalEmpty` in `CalendarBits.tsx`
is the whole screen when there is nothing on it: the figure, one line, and two
buttons. The month title, the view button, the filter, Share, Today and the
orange Add all come off, because every one of them is a way of looking at
something and there is nothing to look at; a view switcher between three empty
views and a filter that can only hide nothing teach somebody the screen is
complicated before it has done anything for them. Both calendars render it, and
what differs is only the words and which button leads: a member looks first
("Add classes you like to attend, or discover classes already on the
schedule", Discover filled), a coach publishes first ("Add the classes you
coach", Add your first class filled), because a coach with an empty week has a
public page that does not work yet and sending them browsing would be the wrong
instruction. The one that leads is drawn first as well as loudest; a filled
button under an outline one is a sentence read backwards. `bare` is computed
from the raw rows, never from the filtered ones: a kind switched off is a way
of looking, and "nothing coming up" is a week that has run its course and keeps
its chrome. It reuses Following's illustration deliberately, until there is a
second one.

**The calendar has views, and the month is its name.** `CalendarBits.tsx`
is the chrome both calendars share: the month as the title at the gutter,
then the header's right cluster of three, the view button, the filter
button and the orange plus. The view button (`.calmenu`) wears the current
view's own glyph (the list lines, a single-day calendar, the month grid)
and opens the view sheet; it says what you're looking at, not that a menu
exists, which is why the hamburger went. The views are List, Day and Month
(Week is deliberately not built yet).
The view is a preference (`fl-cal-view`, localStorage) and survives
arrival, unlike the filters.
Day is one day as an hour grid (`DayGrid`): rules per hour, each event a
wash in its kind's colour placed by when it is, overlaps splitting into
lanes rather than stacking, the window an hour either side of what the day
holds, bounded to a sane training day. The selected day's week rides the
sticky chrome as a week strip (`DayStrip`, chevrons walking whole
weeks, today ringed, the pick filled orange). Every week the app draws as
a grid (the Month scroll, the mini calendar, the day strip) starts on
Sunday and ends on Saturday, the US week, by Matt's call; it was
Monday-led for a day and read wrong against every paper calendar. Tapping an event does what
its list row would: a teaching row opens the editor, a shift or Going row
the class sheet (`DayGridEvent` carries `onTap`, or `data-cid`/`data-d`/
`data-base` for a wrapping `ClassOpener`), a personal row `PlanSheet`.
Entering Day resets the scroll (`scrollCalTop`), because the List leaves
its scroller deep in the compensated past and a shorter view inherits that
offset as a random landing; Today in Day view re-picks today rather than
scrolling.
The month title is a door too (`.calhead-door`, the title alone: it wore
a chevron for a day, and the glyph was saying what the tap already says):
it drops `MiniCalPicker` from the sticky header the way Google Calendar's
does, one compact month with chevrons walking months, a dot under any day
that holds something (the same `monthItems` map the Month grid draws
from), and a click-away scrim. A picked date jumps the view that's open:
Day moves its selection, Month scrolls to that month, the List scrolls to
the day, and a past date picked from the List opens Day instead, because
Day is the one view that can show any date while the List only grows into
the past as the scroll asks for it. The stacked `hm`/`ap` clock a `WeekItem` carries says "PM"
uppercase, so anything folding it back to minutes compares
case-insensitively; a `=== "pm"` put every evening class at dawn on the
grid. Month is one continuous scroll of months
(`MonthScroll`, this month first in view, `MONTHS_BACK` behind it and
`MONTHS_AHEAD` ahead, no chevrons), each block naming itself while the
sticky title follows whichever month is under the header and the weekday
initials pin with the chrome (`MonthHeadRow`); a colour pill per class,
today filled, past days dimmed rather than dropped, because a grid you
can look back across is a record.
A tap on a future day lands on that day in the List (`day-{iso}` ids on
the day groups are the landing spots), and picking List from the view
sheet lands at today, because the month scroll can be months deep. The
grid's plans data comes from
`myWeek`'s nine-week horizon, so months beyond it show teaching rows only.
The List's dates are heading rows, everywhere, each with a hairline rule
under it and real weight (`.callist`/`.feedagenda .ps-daycol`, 700 where
the base rule reads 500): a left
date rail was tried for a night and came back out, because one list
grammar across Following and the calendars beat the grid-flavoured margin.
The two nearest days head their sections as words, Today and Tomorrow
(`fmtDayHeaderRel`), the same words Following already used; the dates
resume from there.

**The calendar's header sticks, and the List scrolls back in time.**
`CalSticky` pins the month row under the app header (it measures the
brandbar, which is itself sticky, for its offset), plus whatever the view
adds beneath it, the Month grid's weekday initials or the Day view's week
strip; the list slides beneath the chrome. `usePastReveal` is the way back: the list
still starts at today, and a sentinel above it prepends a slice of past
days each time the top comes into view, compensating the scroll so the
screen doesn't jump. It finds the real scroller by walking up from the
sentinel, because the tabs layout scrolls the body and the coach shell
scrolls its `.stage`, and reading the wrong one put the compensation on a
container that never moves. Past days render dimmed (`.ps-pastday`), the
window is `CAL_PAST_DAYS`, and a standing weekly class extrapolates into
it without a start bound: eight weeks of "your Tuesday class ran on
Tuesdays" is almost always true, and the honest alternative (bounding on
`createdAt`) breaks the moment an edit reinserts the rows.

**The calendar keeps two doors on screen: Today left, Add right.**
`CalBottomBar` floats them over every view on both calendars, both
strokeless pills whose edge is their shadow; Add is the orange one. Today matters more now that
the list scrolls into the past: it lands on the first not-past day
(`scrollToToday`, which knows the coach shell scrolls its `.stage` where
the tabs layout scrolls the body). Share wears the sparkle in the brand
orange and opens the handing-on: a coach's small sheet (the story image,
the week as text, the link), or a member's `ShareMyWeekSheet` straight,
because that sheet already is the options. Add and Share have traded
places, by Matt's call, and the rule is the reason: the top right corner
is the one part of a phone a thumb cannot reach, and adding is the thing
somebody opens this screen to do. So Add floats bottom right in the brand
orange (`.caladd`, beside Today's white pill), and Share went up to the
header beside the view and filter buttons (`.calmenu`, `.calfilter`).
The loud colour follows the primary action rather than staying where it
was drawn.
Share wears its word (`.calshare`, a pill rather than a third circle,
keeping the orange sparkle): it is the one control in that cluster that
does something rather than changes how you are looking, and the sparkle
alone never said which. The row's gap is 10px and not 12px because of it,
and that number is load-bearing: at twelve, "September" lost its last
letters to the ellipsis by six pixels. The title is also the thing that
yields (`.calhead` truncates, the controls never shrink), because a month
in another year carries one ("September 2027") and the cluster it would
otherwise shove off the edge is the way out of the screen. Changing the
pill's width or the gap means measuring the longest ordinary month again.
The Add button asks which kind first: both
calendars open the same sheet and pre-answer the form, so the Adder's own
chair question never shows from here: a coach's offers three rows (a class
you're coaching, a class you're going to, anything else), a member's the
last two. "Anything else" is not a new form: `personal.event` on `Adder`
is the same personal row with the class-shaped parts put away. No studio
picker (a free-text Where instead, riding the existing `location` column),
no type, no photo, and Description reads Notes; because no studio can be
picked, nothing an event says ever reaches a studio's catalog. It lands
under the Personal slice wearing no badge, like every personal row, and
its CTA and toast say calendar rather than plans, because a physio
appointment is not a plan you train by. Editing an existing personal row
keeps the full class form: the row doesn't record which flavor typed it,
and hiding filled-in fields would eat data.

**The colour is the badge: the accent bar says your relationship to the
row, and the checkmarks are the legend.** Teaching wears the brand orange
(`--si`), Going the same green a yes always is (`--go`), Personal a bright
blue (#3b82cc; it was a purplish slate and read as mud beside the other
two), on the calendars' flat rows (`.callist`, the same flat treatment
Following wears, with the bar coloured by `ev-*` on `.ps-event`) and as
tinted washes on the Month grid's pills (`.monthpill`, the colour at 16%
with its own darker ink). A full card fill shipped for a night and read as
a poster wall, which is the lesson the photo cards taught first; the bar
says the same thing at a glance without shouting. The corner badges
(`.ps-corner`, `.ps-goingtag`) said it in words and are gone. The filters
live behind the header's filter glyph now (`.calfilter`, the tune slider):
`KindFilterSheet` is a bottom sheet of switches, one row per kind the
calendar holds, each wearing its colour as a dot (`.kindfilter-dot`), so
the sheet is the legend and the filter at once. Everything is on by
default and off resets on arrival (a filter is a way of looking, not a
fact worth storing); the rows narrow live behind the sheet, and the pill
rail they replaced (`KindChecks`) is gone. The glyph renders whatever the
calendar holds, and a sheet with one row still explains the one colour. Colour by
relationship is three meanings, three colours, stable everywhere. Shift
rides its own line above the name (which kind of yours it is comes before
what it is); Private and Duplicate stay on the name line, facts about the
class rather than about why it's yours. Saved is still not a word a class
wears.

**The poster covers a range you choose, one day to seven, and it starts where
your plans do.** It used to be the seven days from today and to draw only the
Going marks, so a member whose only class was nine days out shared a blank
image with nothing to tell them why, and a member whose week was all their own
entries shared an empty one every time. `/api/story/me` takes `from` and
`days` (clamped to 1..7) and draws both halves of a week; `ShareMyWeekSheet`
defaults `from` to the first day the list actually holds something, which is
what stops the empty poster being the first one anybody sees. Seven is the
ceiling because the canvas is fixed and `planStory` has to fit it; one is the
floor because "I'm at this tonight" is a real thing to post. The kicker names
the range it drew rather than the day it was made.

**The tabs are five where Home is visible, four everywhere else: Home,
Following, Search, Schedule, You.** Home leads when it's there, and it is
dark-launched (`homeVisible()`: an admin, or `HOME_ENABLED=true`), by
Matt's call, until it's right. While it's dark the tab is in his bar and
nobody else's, `/home` answers everyone else with Following (the URL is
guessable, so it gets the same answer the bar gives), and nothing lands
there: `landingHref()` is the one answer for signing in, finishing setup,
the wordmark and the OAuth callbacks, and it says `/feed` for everyone
the tab is hidden from. A client can't ask who is an admin, so `AuthFlow`
and `OnboardingWizard` take the landing as a prop from their server
parent rather than guessing. Following leads for everyone else, and only
moves when the people you follow do, which made the app feel dead on the
second visit; Home is the mixed scroll that has something on it either
way, which is why it takes the lead the day the flag opens.
"Search" is the Discover directory renamed, route unchanged at
`/discover`, because Home and "Discover" both read as "find stuff" and two
tabs promising the same thing is one tab nobody opens: Home is curated,
Search is intent. The tab wears the magnifier and the header's corner
magnifier left with the rename, since the same glyph on a tab and in the
corner is one door drawn twice; the `/search` box screen is still behind
the directory's search door. Plans is gone as a word in the chrome, and
nothing counts a badge, because a number that only grows is a scoreboard.
Schedule is your own calendar; You is the person, the account screen
included. `navTabs()` in `src/lib/nav.ts` is the one list both bars
render, and it takes the Home flag rather than reading it, because both
bars are client components and the answer is the server's. `/week` stays in the `(tabs)` route group and lights Schedule for
a member; a coach landing on it is redirected to `/app`, and a member
landing on `/app` is redirected to `landingHref()`. That second direction
was missing for months and it was not a stray-URL problem: the installed
app's `start_url` is `/app`, so every member who put fittlist on their home
screen opened the coach's calendar on every launch, offering to add a class
to a public page they cannot have and saying "add the classes you coach" to
somebody who coaches none. The two redirects are one rule, and neither kind
can arrive on the other's calendar. In `?from=`
tokens and `backToFor`, "home" means the Home tab now and the Following
feed says `from=following`; the class page honours both. The current tab
marks itself with a light brand-orange wash behind the glyph alone
(`.navtab.on .navglyph`, the icon's stroke and the label untouched); it
replaced the white capsule behind the whole tab, in the browser bar and
the installed app's glass pill alike. Every header icon
fills in on its own screen (`HeaderIconLink`); the fill is CSS on the
first SVG path only, because the bell's clapper is an open stroke and
filling it paints shapes nobody drew. A hamburger is deliberately not
built: a lid over an empty shelf is where things go to be forgotten.

**Home is a finite page that ends.** `homescreenspec.md` (with its
wireframe) is the build spec; `src/lib/home.ts` is the one loader and
`HomeScreen` the render. The sections in order: the place chip and the
date; Upcoming (your own Going marks, next seven days, chronological, a
rail of cards with the class colour down the spine, each card a
`ClassOpener` door to the class sheet, with a designed empty state because
your own list's emptiness is actionable); People near you (the follow
graph's front door: an avatar rail of not-yet-followed people, your city
first then newest, the face navigates and the pill follows in place);
Studios (three rows, Verified badged with coach and class counts, a
community row saying "added by N coaches", every row a door to `/s/{slug}`);
Activity (what the people you follow did this week, coach posts first
then attendance, each newest first: a batch of three or more new series
reads "posted next week" with the count and the studios, a smaller add
reads "added a class" leading with a studio they hadn't taught at before
when there is one, both collapsed to one row per coach; then public Going
marks, future ones "is going to" and passed ones "went to" with the
relative day; grouped by seriesId throughout so a weekly class counts
once, capped, closed by the privacy line. A coach putting next week up is
the one thing here that regenerates without any growth in the follow
graph, which is why it leads). Nothing is ranked: proximity is the location string, recency is
createdAt, and every section with nothing to say is removed rather than
shown empty, Upcoming excepted. Events and clubs are in the spec and
deliberately not built. The one spec line not shipped: Follow on a
verified studio's row, because the feed and digest pipelines are
handle-keyed and a Follow that buys nothing visible would be a lie; the
row is a door until following a gym means something.

**Feedback rides on the inquiry tables.** `inquiry_threads.kind` is `"inquiry"`
(a visitor asking a coach about private sessions) or `"feedback"` (someone
writing to us about the app), and the unique index is
`(coach_user_id, requester_email, kind)`. The admin is also a coach, so without
the kind their feedback and their real private-session requests would collapse
into one thread. Every upsert has to name all three columns: `sendInquiry` was
left naming two, which matches no index, and each request 500'd on "no unique or
exclusion constraint matching the ON CONFLICT specification" until the smoke
suite started sending one. Anything counting or listing "requests" has to filter
on `kind` too: `/requests` and the account's Requests stat both would otherwise
show the admin their own feedback as people asking about private sessions. `feedbackHost()` picks the first `ADMIN_EMAILS` address with an
account; no account means no door, and the settings row hides.

**A `"use server"` file can only export async functions.** A constant in one
500s every page that imports it.

## Not yet, and deliberately

Two things are coming that today's shapes should leave room for. Neither is
built; don't build them until they're asked for, but don't paint them out
either.

**Charging.** `PRICING.md` holds the membership model: members free forever,
a coach paying a few dollars a month to publish a schedule, a studio paying
more for its page and its rota, and a free month for every coach you bring.
Nothing is built and nothing should be until it's asked for, but two shapes
already in the code are the ones it will lean on, so don't undo them: the gym
account (`studios.accountUserId`) is what a studio would be billed against, and
`studio_managers` is what "we run this page" means. The open questions are in
that file, and the sharpest is what happens to a coach's page when they stop
paying: the URL is out in the world and their followers have Going marks on it.

**Teams.** A run club with six coaches, followed once instead of six times, with
a team version of the profile and a merged team schedule. Anything that assumes
a class belongs to exactly one `users` row, or that "follow" only ever points at
a person, is the kind of assumption that will need unpicking. `subscribers` and
`classes.userId` are the two places to be careful.

**Categories.** Kettlebell, run club, and the rest, followable in their own
right so someone can see what's coming up near them by the kind of thing it is.
`classes.classType` and `customClassTypes` are the seed of this; they're free
text per coach today, so a shared vocabulary is the missing piece. Discover
already groups by exact location string, which is the model to follow.
