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
3. **Surgical changes.** Touch what the task needs and match the style
   around it. Don't refactor in passing; a cleanup is its own commit.
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

**The tabbed shell is a layout, not per-page.** `/feed`, `/discover` and
`/you` live in the `(tabs)` route group; its `layout.tsx` renders the header
and the tab bar once, and `loading.tsx` sits under it so a tab that's still
loading keeps its chrome. Put them back in the pages and the bar unmounts on
every navigation, which is the thing the layout exists to prevent.

**Locations are one string per place.** Discover groups by the exact value, so
`normalizeLocation` canonicalizes to "City, ST" on save and the field suggests
the cities already in use. A bare city snaps onto its only match; with two
matches it asks which, and with none it asks for the state. Adding another
place that writes `users.location` means passing `knownLocations()` in too.

**A "back" control has to pop, not push.** `useSlideBack` checks `pageBeneath()`
(a small path stack kept in sessionStorage by `NavTrack`) and calls
`router.back()` when the page underneath is where the control points. Pushing
unconditionally is what trapped people between a coach page and a class page:
both link to each other, so every tap grew history and the browser button could
only walk the pile. A coach's page answers to three URLs, so compare with
`samePage()` rather than `===`.

**A coach's profile is a route per tab, and the bare handle is the schedule.**
`/{handle}` renders Schedule, `/{handle}/about` and `/{handle}/contact` the
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

**Stacking contexts.** The account view is a positioned `z-40` layer and the tab
bar is `z-45`, so a sheet rendered inside the account view sits *under* the tab
bar and its bottom button can't be tapped. Portal such sheets to `document.body`
(see `InviteFriends.tsx`).

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
`personal_classes` instead: name, weekday, time, place and a free-text coach
name, living only in their own week. There is deliberately no column that
could make one public, so the wall can't be left open. Becoming a coach is an
ask, not a switch: `requestCoaching` files it, the admin's People tab answers
it, and `adminSetKind`/`adminAnswerCoachRequest` are the only things that flip
`users.kind`. The named coach is an
invite lead ("Is Jenny on fittlist?"), not a users reference: naming your
coach is not putting them on the platform. The admin Reports tab lists
same-studio-same-time classes under two accounts, which is what the old leak
looks like from above.

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
wins. A shift is work, not a listing: it stays out of the coach's public page
and their public `.ics`, and lands in the private token feed instead.

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

**A studio running a schedule wears the same tabs a person does.** `/s/{slug}`
is the schedule, `/s/{slug}/about` and `/s/{slug}/contact` the rest, and
`/s/{slug}/schedule` resolves too. The schedule leads for the same reason it
does on a coach's page: it's what the link is for. A directory entry with no
schedule has nothing to divide, so it keeps the single sectioned page it always
had (`show()` in `StudioView`), which is almost every row in the table and
should stay that way. `samePage()` already collapses the suffixes, so back
pops. A gym's class lives at `/s/{slug}/{classId}`, because its account has no
handle; `classDetail()` takes a handle **or** a studio slug and scopes the
lookup either way.

**A handle is not "has a page you can link to".** `week.ts` dropped any saved
class whose owner had no handle, which silently emptied a member's plans of
every gym class the moment gyms existed. Anything building a class URL wants
the base (`handle`, or `s/{slug}` for a gym), not the handle.

**A studio is the commons until somebody claims it.** The directory has always
run on trust: any coach can correct any entry, because a row nobody owns is
better kept right by the people who teach there than left wrong. One
`studio_managers` row changes that. From the first manager on, the studio is
claimed: only its managers (and `currentAdmin()`, who must be able to fix a gym
that locks itself out) may edit, everyone else gets the Suggest an edit door
they already had, and the page says "Kept by the studio" so the missing pencil
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

**A class opens as a sheet from a list, and as a page from a link.**
`ClassSheet` pulls up over whatever list you tapped, so adding reads as picking
something up rather than going somewhere; `/{handle}/{classId}` stays because a
link someone was sent has to open something real, and the sheet's Share button
points at exactly that. A server-rendered list keeps real `href`s and wraps in
`ClassOpener`, which catches the ordinary tap and lets a modified click through.
`classDetail()` is the one loader both use, so the occurrence rule (`?d=`, then
the next date it runs) can't drift between them.

**Your week is a shortlist, not a calendar.** `/week`, behind the header icon,
lists only the classes someone added, from today forward, and empties itself as
the week passes. Three things keep it from reading as "fittlist wants to be your
calendar now": it is short and partial, every row can leave, and the bottom of
it offers Share my week rather than a calendar export (the `.ics` feed lives on
the account page until the Google Calendar work lands). Don't add a month grid,
empty days, or a time gutter. The badge counts what's still ahead
(`weekCount()`), not everything ever added: a number that only grows is a
scoreboard rather than something you can act on. Following is everything from
the coaches you follow; Your week is the ones you picked. Those have to stay
legibly different.

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
