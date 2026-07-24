# fittlist

One link in your bio. Always your current week, every studio you coach at.

See `BUILD-BRIEF.md` for the product spec and `design/fittlist-prototype-v10.html`
for the source-of-truth prototype (open it in a browser; resize across 940px for
mobile/desktop).

## Stack

Next.js (App Router, TypeScript) · Drizzle ORM · Postgres (embedded PGlite in
dev, `DATABASE_URL` in prod) · Resend for email (console fallback in dev).

## Develop

```bash
npm install
npm run dev
```

No setup needed: with `DATABASE_URL` unset, an embedded PGlite database is
created at `.data/pglite` and migrations run automatically on first request.
Login codes are printed to the server console when `RESEND_API_KEY` is unset.

Environment variables are documented in `.env.example`.

## Database

Schema lives in `src/db/schema.ts`; SQL migrations in `drizzle/`.

```bash
npm run db:generate   # regenerate migrations after schema changes
```

Migrations run automatically on boot (dev and prod).

## Smoke test

End-to-end test of the core loop (claim → publish → public page, both
breakpoints) against a running production build:

```bash
npm run build
rm -rf .data && npm run start &   # fresh DB; OTP is read from the server log
SERVER_LOG=<path-to-server-log> node scripts/smoke.mjs
```

## Phase status

- [x] Phase 1 — core loop: auth → adder → public page
- [ ] Phase 2 — the list: welcome + change emails, unsubscribe
- [ ] Phase 3 — dashboard + growth: visit tracking, stats, OG tags
- [ ] v1.5 — share image endpoint
