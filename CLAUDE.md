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
  NEXT_PUBLIC_ORIGIN=http://localhost:3000 npm run start > server.log 2>&1 &
node scripts/feedback-smoke.mjs   # writing in, the reply, one thread per person
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

**Feature flags** (`src/lib/flags.ts`) compare exact strings. `FANS_ENABLED`
must be literally `"true"` or `"coaches"`; `"1"` and `"yes"` are off.

**The beta gate** covers everyone, coaches and members alike
(`INVITE_ONLY !== "false"`).

**A handle is not a coach badge.** Members claim one too, and `/{handle}`
renders `MemberProfileView` instead of the coach page when `kind === "fan"`.
Anything asking "is this a coach?" must test `kind`, not `handle`: that
substitution was true for months and is now wrong in about six places.

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

**Stacking contexts.** The account view is a positioned `z-40` layer and the tab
bar is `z-45`, so a sheet rendered inside the account view sits *under* the tab
bar and its bottom button can't be tapped. Portal such sheets to `document.body`
(see `InviteFriends.tsx`).

**Feedback rides on the inquiry tables.** `inquiry_threads.kind` is `"inquiry"`
(a visitor asking a coach about private sessions) or `"feedback"` (someone
writing to us about the app), and the unique index is
`(coach_user_id, requester_email, kind)`. The admin is also a coach, so without
the kind their feedback and their real private-session requests would collapse
into one thread. `feedbackHost()` picks the first `ADMIN_EMAILS` address with an
account; no account means no door, and the settings row hides.

**A `"use server"` file can only export async functions.** A constant in one
500s every page that imports it.
