# fittlist

**One link in your bio. Always your current week, every studio you coach at.**

Fittlist is a link-in-bio weekly schedule for group-fitness trainers. A coach
claims a handle, adds the classes they teach across every studio, and shares one
permanent link (`fittlist.co/{handle}`). The link never goes stale — it always
shows the current week — so it can live in an Instagram bio forever and their
students always see what's on.

- **App / "My Calendar"** (`/app`) — the trainer's private schedule editor.
- **Public page** (`/{handle}`) — what students see; a clean weekly list.
- **Event page** (`/{handle}/{classId}`) — tap a class for the booking details.

`BUILD-BRIEF.md` is the original product spec. `design/fittlist-prototype-v10.html`
was the source-of-truth prototype; the live app has since evolved into the flat
"Ink" visual style described under [Design](#design).

---

## Features

- **Email OTP auth** — no passwords. A 6-digit code is emailed; a signed session
  cookie keeps the coach logged in.
- **The adder** — add a class once (name, time, length, studio, booking links).
  Classes **repeat weekly** by default, or can be pinned to a **one-off date**
  (a cover class or workshop) that only shows the week it falls in.
- **Shared studio directory** — studios are added once and reusable by everyone;
  each gets a deterministic color.
- **Public page** — always the current Mon–Sun week. Weekly classes plus in-week
  one-offs; past/future one-offs never leak. Each event taps through to its own
  booking page (studio, map link, "Book via …" buttons).
- **Preview bar** — when a coach views their own public/event page, a sticky bar
  makes it clear it's a preview and links back to their account. Visitors never
  see it.
- **The list** — students subscribe by email; every schedule change emails them
  (RFC 8058 one-click unsubscribe). Welcome + change emails run through a
  pluggable notifier.
- **Dashboard** — visits (own views + bots excluded), subscriber count, class
  count.
- **Share image** — a 1080×1920 story PNG of the week/day in four color themes,
  rendered server-side with `next/og`. Saveable to Photos / shareable via the
  native share sheet.
- **Calendar sync**
  - **iCal feed** (`/api/cal/{handle}`) — subscribe in Apple/Outlook/Google;
    weekly classes as recurring events, one-offs as single events.
  - **Google Calendar** (OAuth) — connect a Google account and classes are
    mirrored into the calendar and re-synced on every change (one-way,
    fittlist → Google). See [Google Calendar setup](#google-calendar-setup).
- **Growth loop** — the public-page footer is attributed (`/?via={handle}`) so
  signups from a coach's page are tracked.

---

## Stack

| | |
|---|---|
| Framework | Next.js 15 (App Router, RSC + server actions), React 19, TypeScript |
| DB | Postgres via Drizzle ORM — embedded **PGlite** in dev/test, `DATABASE_URL` (Neon) in prod |
| Email | Resend (console fallback when unconfigured) |
| Auth/crypto | `jose` (session + signed tokens), Node `crypto` (AES-256-GCM at rest) |
| Images | `next/og` (satori) with vendored TTF fonts |
| Testing | Playwright end-to-end smoke suite |
| Hosting | Vercel (auto-deploys from `main`) |

---

## Local development

```bash
npm install
npm run dev
```

No setup required. With `DATABASE_URL` unset, an embedded PGlite database is
created at `.data/pglite` and migrations run automatically on first request.
With `RESEND_API_KEY` unset, login codes and emails are printed to the server
console instead of sent.

Environment variables live in `.env.example`.

---

## Environment variables

| Var | Required | Notes |
|---|---|---|
| `DATABASE_URL` | prod | Postgres connection string. Unset → embedded PGlite. |
| `SESSION_SECRET` | prod | Long random string. Signs sessions **and** derives the key that encrypts stored Google refresh tokens. |
| `NEXT_PUBLIC_ORIGIN` | prod | Canonical origin, e.g. `https://fittlist.co`. Used in links, OAuth redirect, OG tags. |
| `RESEND_API_KEY` | prod | Unset → emails logged to console. |
| `MAIL_FROM` | prod | Verified Resend sender, e.g. `fittlist <hello@fittlist.co>`. |
| `GOOGLE_CLIENT_ID` | optional | Enables Google Calendar sync. Unset → the feature is hidden. |
| `GOOGLE_CLIENT_SECRET` | optional | Paired with the client ID. |

---

## Project structure

```
src/
  app/
    page.tsx                     landing + auth (AuthFlow)
    app/                         the trainer app ("My Calendar")
      layout.tsx                 session guard + shell
      page.tsx                   schedule (ScheduleScreen) + profile data
    [handle]/
      page.tsx                   public weekly page
      [classId]/page.tsx         per-event booking page
    api/
      cal/[handle]/route.ts      iCalendar (.ics) subscribe feed
      google/connect|callback    Google OAuth (mirror sync)
      story/[handle]/route.tsx   share image (next/og)
      unsub/[token]/route.ts     one-click unsubscribe (List-Unsubscribe-Post)
    u/[token]/page.tsx           unsubscribe landing page
    actions/                     server actions (auth, classes, studios,
                                 subscribe, google, theme)
  components/                    ScheduleScreen, Adder, ProfileSheet, AuthFlow,
                                 NotifyCta, Toast, Icon, Wordmark
  db/                            schema.ts, index.ts (PGlite/pg client + migrate)
  lib/                           format, session, mailer, notifier, visits,
                                 gcal, crypto, brand, types
  assets/fonts/                  vendored TTFs for the share image
drizzle/                        SQL migrations + snapshots
scripts/                        smoke.mjs, check-attribution.mjs
```

### Data model (`src/db/schema.ts`)

- **users** — email, name, handle, theme, signup source.
- **studios** — shared directory; `seq` drives the color cycle.
- **classes** — `dayOfWeek` (0=Mon…6=Sun), `startTime` (HH:MM), `durationMin`,
  `name`, `studioId`, `links` (jsonb), and nullable **`specificDate`** (set = a
  one-off; null = standing weekly).
- **classTemplates** — the "saved class" autofill, upserted on publish.
- **subscribers** — per-trainer email list with opt-out timestamp.
- **pageVisits** — daily visit rollups.
- **googleConnections** — encrypted refresh token, calendar id/timezone, and the
  set of event IDs fittlist created (so a re-sync clears only its own events).
- **messageLog / authCodes** — email audit + OTP throttling.

---

## Database & migrations

Schema is in `src/db/schema.ts`; SQL migrations in `drizzle/`. Migrations run
automatically on boot (dev and prod).

```bash
npm run db:generate   # regenerate migrations after editing the schema
```

---

## Smoke test

`scripts/smoke.mjs` drives the whole product with Playwright against a running
**production build**: claim → adder (weekly + one-off) → schedule → edit/delete
→ public page → per-event page → subscribe/unsubscribe → stats → share image →
iCal feed → preview bar.

```bash
npm run build

# fresh DB + local origin so links/tokens point at localhost, not prod
rm -rf .data/pglite
NEXT_PUBLIC_ORIGIN=http://localhost:3000 npm run start > /tmp/server.log 2>&1 &

# the browser must reach localhost directly (bypass any HTTPS proxy)
env -u HTTP_PROXY -u HTTPS_PROXY -u http_proxy -u https_proxy \
  SERVER_LOG=/tmp/server.log node scripts/smoke.mjs
```

The OTP is read from the server log. `scripts/check-attribution.mjs` verifies
the growth-loop signup attribution (run with the server stopped — PGlite is
single-process).

---

## Deployment

Vercel auto-deploys from `main`.

1. **Neon** — create a Postgres database; set `DATABASE_URL` in Vercel.
2. **Resend** — verify the sending domain; set `RESEND_API_KEY` and `MAIL_FROM`.
3. Set `NEXT_PUBLIC_ORIGIN=https://fittlist.co` and a strong `SESSION_SECRET`.
4. Migrations run on the first request after deploy. Serverless bundles include
   `drizzle/**` and the vendored fonts via `outputFileTracingIncludes` in
   `next.config.ts`.

---

## Google Calendar setup

Google sync is **one-way (fittlist → Google)** and stays hidden until the two
env vars are set. To enable it:

1. **Google Cloud Console** → new project → enable the **Google Calendar API**.
2. **OAuth consent screen** (External): add the `.../auth/calendar.events`,
   `openid`, and `email` scopes; add yourself (and early trainers) as **test
   users** until the app is verified.
3. **Credentials → OAuth client ID** (Web application):
   - Authorized redirect URI: `https://fittlist.co/api/google/callback`
     (add preview-deployment URLs too if you test there).
4. Put the **Client ID** / **Client secret** into Vercel as `GOOGLE_CLIENT_ID`
   / `GOOGLE_CLIENT_SECRET`; redeploy.
5. In the app: **menu → Connect Google Calendar**.

Notes:
- The refresh token is stored **AES-256-GCM encrypted** (key derived from
  `SESSION_SECRET`).
- Sync runs via `after()` so publishing stays fast; it clears the events it
  created last time and repopulates, never touching personal events.
- "Mirror" means edits made *inside* Google don't flow back to fittlist.
- Before opening to all trainers, submit the app for Google verification
  (needs a privacy policy + domain verification).

---

## Design

The app renders in the flat **"Ink"** style: a light cream ground
(`#F7F2E8`), Exhaust ink (`#191502`) text and borders, Sienna (`#DD583A`) and
Tacha-green (`#CBD665`) accents, and the Archivo Black / Archivo / Space Mono
type stack. Events read as an editorial list — a mono time gutter, bold class
name, muted studio. The theme system (`users.theme`) still carries legacy
`classic`/`blocks` variants in the code, but Poster/Ink is the only reachable
style.
