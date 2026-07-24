# Fittlist — Build Brief

**One link in your bio. Always your current week, every studio you coach at.**

Fittlist is a link-in-bio schedule tool for group fitness trainers. A trainer claims `fittlist.co/handle`, publishes the classes they coach across multiple studios, and shares one permanent link. Fans tap the link (no app, no account), see the current week, and can join an SMS list that texts them whenever the schedule changes. The trainer never re-posts an Instagram story about a time change again.

This brief plus `design/fittlist-prototype-v10.html` is the complete spec. The prototype is the source of truth for every screen, flow, state, and piece of copy — open it in a browser and click through both the trainer app and the public page before writing code. It is fully responsive: below 940px is the mobile design, above it is the desktop design. Match it.

---

## 1. Scope

### Build (v1)

1. **Email auth** — email + 6-digit code (magic link acceptable). No passwords. No Twilio anywhere in v1.
2. **Onboarding** — email → code → name (handle generated live from name, e.g. `fittlist.co/matt`). Three screens total, then straight into the class adder.
3. **The adder** — the most important surface in the product. See §4.
4. **Saved class templates** — a class is remembered in full (name, time, duration, studio, booking links) the first time it's published. Thereafter the adder opens on the saved-class list; picking one fills everything and the trainer only picks days.
5. **Shared studio directory** — studios are global entities with exactly two fields: name and address. Any trainer can add one; every trainer can then use it. No dedupe UI in v1 (search-before-add in the picker is the dedupe).
6. **Multiple booking links per class** — each link has a label (`Website | Mindbody | ClassPass | Other`) and a URL. Rendered on the public page as separate "Book via X ↗" links.
7. **Public page** at `fittlist.co/{handle}` — server-rendered, no auth, fast on cellular. Trainer name, studios, week grouped by day, booking links, studio addresses. Sticky "Text me when this changes" CTA. Footer: "Made with fittlist — coach classes? Claim your page" (this is the growth loop; don't drop it).
8. **Email notify list** — fans subscribe with an email address. Every publish/delete that changes the schedule sends one email to the list. One-click unsubscribe handled properly.
9. **Stats** — trainer's "My page" tab shows: page visits (this week), list size, class count. These three numbers are the product's validation dashboard; instrument them first-class.

### v1.5 (build after v1 works end to end)

10. **Share image** — 9:16 story image generated from the schedule (week or today), Exhaust background, class list in Space Mono, `fittlist.co/{handle}` + lockup as watermark. Server-side render (e.g. satori/resvg or canvas) to PNG. Layout is in the prototype's share sheet.

### Explicit non-goals (do not build)

- No fan accounts, follow graph, attendance/"I'm going", or discovery feed
- No payments or in-app booking (links out only)
- No month/calendar-date view
- No native apps — responsive web only
- No studio pages, photos, or metadata beyond name + address

---

## 2. Product decisions (already made — don't reopen)

- **Standing weekly schedule.** A published class recurs every week until deleted. The link must never go stale; that's the core promise. Per-week planning is a possible later mode, not v1.
- **Email-first for v1.** Login and notifications run on email so v1 needs no Twilio/A2P registration. SMS remains the intended upgrade for notifications once the loop is validated — texts beat email for gym-goers — so put the notification sender behind a small interface that can swap channels later without touching callers.
- **"Your list", not "followers."** Copy throughout says list. It's an SMS list the trainer owns.
- **One publish, many days.** Day selection is multi-select; publishing Mon+Wed+Fri creates three class rows and sends one notification text, not three.
- **Templates track latest.** Publishing a class upserts its template with whatever values were used, so autofill always reflects the most recent version.
- **Counting visits**: a trainer viewing their own page doesn't count.

---

## 3. Data model

```
users
  id, email (unique, lowercased), name, handle (unique, slug), created_at

studios                      -- global/shared, seeds the future Lift Local directory
  id, name, address, created_by_user_id, created_at

class_templates              -- "saved classes", per trainer
  id, user_id, name, start_time (time), duration_min (int),
  studio_id, links (jsonb: [{label, url}]), updated_at
  unique (user_id, name)

classes                      -- the standing week
  id, user_id, template_id (nullable), day_of_week (0–6),
  start_time, duration_min, name, studio_id, links (jsonb), created_at

subscribers
  id, trainer_user_id, email (lowercased), created_at, opted_out_at (nullable)
  unique (trainer_user_id, email)

page_visits                  -- daily rollup is fine
  trainer_user_id, date, count

message_log                  -- every outbound message, for debugging + rate limits
  id, to_address, kind (otp|schedule_change|welcome), body, sent_at, status
```

Suggested stack (builder's choice if better-reasoned): Next.js (app router) + Postgres + Prisma/Drizzle + Resend or Postmark for email + Vercel. Keep it boring.

---

## 4. The adder — hold this bar

The adder is the product's hero. Target steady-state flow: **tap +, tap a saved class, tap days, tap publish.** Four taps.

States and behaviors (all in the prototype):

- **Start stage** (only when ≥1 template exists): "Add to your week" — saved classes listed with studio color dot, name, and summary line (`6:00a · 50 min · Ironbound Strength · 2 links`), plus "+ New class."
- **Form stage**: name (type-ahead autofill against the trainer's own templates as they type; picking a match fills everything), day multi-select pills, start-time presets (6:00a, 9:00a, 12:00p, 5:30p, 6:30p) + native time input, duration chips (30/45/50/60/75), studio selector, booking-link rows, publish button.
- **Smart defaults**: new-class form pre-fills last-used time, duration, and studio.
- **Publish button narrates**: disabled "Pick at least one day" → "Publish 3 classes · MON, WED, FRI · 6:00a · texts 12".
- **Studio picker stage**: search (name or street) over the shared directory; "+ New studio" → two fields (name, address) → saves to the directory and selects it. Note under the list: "Studios are shared. Add one once and every trainer can use it."
- **Duplicate**: every schedule card has a duplicate action that opens the form prefilled (days empty).
- **Link rows**: label select + URL input + remove; empty URLs dropped on save.

## 5. Auth & notification behavior

- Auth OTP: 6 digits by email, expire ≤10 min, basic rate limiting per email/IP. Resend or Postmark; free tiers are plenty for v1. Set up SPF/DKIM on fittlist.co so codes don't land in spam.
- Subscribe flow sends one welcome email: what they'll receive (new classes, time changes, cancellations — nothing else) + unsubscribe link.
- Change notification: one email per publish/delete action, e.g. subject `Matt updated his schedule`, body `Barbell Strength added Mon & Wed 6:00a at Ironbound Strength → fittlist.co/matt`. Debounce multiple actions within ~2 min into one email if simple; otherwise one-per-action is acceptable in v1.
- Every list email carries a one-click unsubscribe (sets `opted_out_at`); honor it everywhere. Compliance copy exactly as in the prototype's notify sheet.
- Channel note: the notifier is the piece most likely to move to SMS later — isolate it.

## 6. Design system

The prototype's CSS is the reference implementation. Tokens:

| Token | Hex | Role |
|---|---|---|
| Cloud | `#F7F2E8` | Background everywhere — warm paper, never pure white pages |
| Exhaust | `#191502` | Ink: text, dark surfaces, story image |
| Sienna | `#DD583A` | The only action color: publish, CTAs, active states, wordmark period |
| Sky | `#92A6A7` | Studio color 1 (auto-assigned, cycles) |
| Tacha | `#CBD665` | Studio color 2 |
| Sand | `#D6D1B3` | Lines, rails, disabled, studio color 3 |
| Olive | `#4E4B3B` | Secondary text, studio color 4 |

Type: **Archivo Black** (display), **Archivo** (UI), **Space Mono** (times, labels, eyebrows). Google Fonts.

Studio colors cycle `[Sky, Tacha, Sand, Olive]` by directory index — deterministic, no per-user assignment.

Brand assets in `/brand`: mark, app icon, wordmark, and lockups (ink + cloud versions), all production SVG with the wordmark as vector paths (no font dependency). Use the app icon SVG as favicon. `brand/fittlist-identity.html` documents usage rules; the one that matters in code: never rearrange the mark's blocks.

Desktop (≥940px): sidebar nav replaces the tab bar; schedule renders as a 7-column week grid (all days shown, including empty); public page is sticky identity column + scrolling schedule; sheets become centered modals. All in the prototype.

## 7. Phases

1. **Core loop**: auth → adder (with templates, studios, multi-links) → public page. A trainer can claim, publish, and share a working link.
2. **The list**: subscribe, welcome email, change notifications, unsubscribe.
3. **Dashboard + growth**: visit tracking, stats tab, "Made with fittlist" footer flow, OG meta tags for pretty link unfurls.
4. **v1.5**: share image endpoint.

Ship 1–3 before touching 4.

## 8. Success metrics (instrument from day one)

Weekly page visits per trainer, notify-list signups, and trainers who signed up via the public-page footer (organic). These three numbers decide the roadmap.
