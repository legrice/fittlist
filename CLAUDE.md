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
npm run build                    # runs the copy check first
npm run db:generate              # after any schema change
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
```

One reset per script, not per group: each claims the same handles and emails,
so a second script on a used database trips over the first one's account.

`NEXT_PUBLIC_ORIGIN=http://localhost:3000` matters for anything that follows an
emailed link: without it the redirect points at fittlist.co and leaves the
sandbox.

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
and a profile that can be lost at is worse than no profile.

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
could make one public, so the wall can't be left open. The named coach is an
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
