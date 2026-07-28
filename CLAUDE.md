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
node scripts/auth-smoke.mjs       # password recovery, the coach/follower choice

rm -rf .data/pglite
INVITE_ONLY=false FANS_ENABLED=true npm run start > server.log 2>&1 &
node scripts/private-smoke.mjs    # public vs private classes
```

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

**Stacking contexts.** The account view is a positioned `z-40` layer and the tab
bar is `z-45`, so a sheet rendered inside the account view sits *under* the tab
bar and its bottom button can't be tapped. Portal such sheets to `document.body`
(see `InviteFriends.tsx`).

**A `"use server"` file can only export async functions.** A constant in one
500s every page that imports it.
