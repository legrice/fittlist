# fittlist — designer context

A self-contained brief for someone designing new screens. No repo access needed.

Everything below is copied from the real source. Where a file was too long to
paste whole, the trim is marked inline and says what came out.

**Length.** 1,736 lines, over the ~1,500 target. The class detail section (4)
was kept fullest because it is the screen the new work touches most; the budget
went there rather than into the schema and component sections, which are
trimmed harder. Every trim is marked inline with what came out. The biggest
cuts: `Icon.tsx` (the 213-line map, replaced by the list of available names),
the `users` and `classes` tables (long tails of columns), `ClassSheet`'s state
and its nine sheet bodies, and the cookie plumbing in `joinlink.ts`.

**Redaction.** No keys, tokens, env values, connection strings, customer emails
or phone numbers appear here. Two illustrative first names in a schema comment
were replaced with placeholders. The only email in the file is the app's own
public support address.

**Scope note.** This describes the app as it stands today. Section 10 lists the
parts that are half-built or unwired, and it is worth reading before proposing
changes to anything in sections 4, 5 or 7.

---

## 1. Stack and conventions

**Framework.** Next.js 15 (App Router, React 19). Every screen is a server
component by default; interactive pieces opt in with `"use client"`.

**Styling.** Plain CSS. One global stylesheet, `src/app/globals.css` (~4,900
lines), organised by feature with comment banners. There is no Tailwind, no CSS
modules, no styled-components, no `class-variance-authority`. Styling is done by
adding a class to that file and using it. Class names are flat and namespaced by
feature (`.ps-event`, `.classoverlay-nm`, `.disrow-main`, `.setrow`).

**State.** React `useState` / `useTransition` locally. No Redux, Zustand, or
React Query. Server state arrives as props from server components; mutations go
through server actions and then `router.refresh()` or `revalidatePath`.

**Routing.** App Router file routes. `src/app/(tabs)/` is a route group whose
`layout.tsx` renders the header and tab bar once for every screen inside it.

**Backend.** Postgres via Drizzle ORM. Local dev runs PGlite (an in-process
Postgres) at `.data/pglite`; migrations run automatically on first `getDb()`.

**Data fetching on the client.** There isn't much. Server components query the
database directly. Client components call server actions (`"use server"`
functions) and get plain objects back. There is no REST or GraphQL API layer for
the app's own screens; `src/app/api/*` exists only for things that are genuinely
HTTP (calendar feeds, share images, QR codes, OAuth callbacks).

### Conventions a newcomer would break by accident

- **Never use an em dash in user-facing copy.** `npm run build` fails on it
  (`scripts/check-copy.mjs`). Use a full stop, a colon, or parentheses. The one
  exemption is the date header (`Wednesday — July 24`), which carries a
  `check-copy-ignore` pragma. Comments are exempt.
- **A `"use server"` file can only export async functions.** Exporting a
  constant from one 500s every page that imports it.
- **Reuse the existing thing before building a new one.** A class row is
  `.ps-event` everywhere it appears; a bottom sheet is `.sheet` with
  `.sheetclose`; a settings row is `.setrow`; a chip grid is `TypePicker`. A
  second copy always drifts.
- **Class strings are inlined** in JSX, usually with a template literal for
  variants: ``className={`chip${on ? " sel" : ""}`}``. There is no variant
  helper and no `clsx`.
- **Variants are expressed as extra classes**, not props-to-styles. `.btn` is
  the base; `.btn.si` is the brand fill; `.btn.ghost` is the outline.
- **Components are named exports** in `src/components/Name.tsx`, PascalCase file
  matching the export. Server actions live in `src/app/actions/*.ts`, shared
  logic in `src/lib/*.ts`.
- **Nothing secret is ever passed as a prop to a `"use client"` component**,
  because props serialize into the page.
- **Copy style:** plain words, short sentences, no exclamation marks, no
  "simply" or "just". Say what happens, not how to feel about it.

---

## 2. Design tokens

All tokens are CSS custom properties on `:root`. There is no JS theme object and
no Tailwind config to paste.

`src/app/globals.css` (lines 1-35)
```css
/* Delight — the brand typeface, self-hosted as woff2. (Static TTF copies of
   400/600/700/800 also live in /public/fonts for the satori share image.) */
@font-face { font-family: 'Delight'; src: url('/fonts/delight-400.woff2') format('woff2'); font-weight: 400; font-style: normal; font-display: swap; }
@font-face { font-family: 'Delight'; src: url('/fonts/delight-500.woff2') format('woff2'); font-weight: 500; font-style: normal; font-display: swap; }
@font-face { font-family: 'Delight'; src: url('/fonts/delight-600.woff2') format('woff2'); font-weight: 600; font-style: normal; font-display: swap; }
@font-face { font-family: 'Delight'; src: url('/fonts/delight-700.woff2') format('woff2'); font-weight: 700; font-style: normal; font-display: swap; }
@font-face { font-family: 'Delight'; src: url('/fonts/delight-800.woff2') format('woff2'); font-weight: 800; font-style: normal; font-display: swap; }

/* fittlist design system - ported from design/fittlist-prototype-v10.html.
   The prototype renders inside a fake phone frame; here the viewport is the
   frame, so absolute-positioned chrome (fab, toast, sheets, bars) is fixed. */

:root {
  /* Delight typeface. Warm charcoal ink, cream ground, pleasant orange CTA -
     the original fittlist palette (à la the meetgen reference boards). */
  --cl: #f4efe1;           /* warm cream — headers, tags, accents */
  --cl-d: #e9e1cc;         /* one step down: chips that need to read off the page */
  --paper: #faf8f2;        /* very light near-white ground for the main scroll */
  --card: #ffffff;         /* white cards float on the cream */
  --ink: #191502;          /* warm charcoal - text + dark surfaces */
  --ol: #6b6555;           /* warm muted secondary text */
  --line: #e6dfcd;         /* warm cream dividers / input borders */
  --rule: #191502;         /* charcoal hairline rules */
  --si: #dd6a35;           /* pleasant warm-orange accent + CTA */
  --si-tint: #fbe4d2;      /* pale brand wash: tinted CTAs, selected tabs */
  --si-ink: #b9531f;       /* brand text/icons sitting on the wash */
  --go: #3d8b53;           /* "on" green for switches */
  --si-soft: #f7e6d6;
  --sa: #d6d1b3;
  --yellow: #f5f200;
  --radius: 16px;
  /* soft drop shadows - floating containers, warm-charcoal tint */
  --soft-shadow: 0 1px 2px rgba(25, 21, 2, .06), 0 5px 16px rgba(25, 21, 2, .08);
  --soft-shadow-lg: 0 2px 6px rgba(25, 21, 2, .07), 0 12px 28px rgba(25, 21, 2, .11);
}
```

### Dark mode

Dark mode is a `data-mode="dark"` attribute on the shell, which re-declares the
same variable names. Components never reference a dark colour directly.

`src/app/globals.css` (dark overrides, excerpt)
```css
[data-mode="dark"] .screen, .screen[data-mode="dark"],
[data-mode="dark"] .chatscreen, .chatscreen[data-mode="dark"],
[data-mode="dark"] .sheet,
[data-mode="dark"] .pub, .pub[data-mode="dark"] {
  --paper: #14120d;
  --si-tint: #3f2413;
  --si-ink: #f0a071;
  --card: #211c13;
  --ink: #f3efe3;
  --ol: #a89f8a;
  --line: #35301f;
  --cl: #272115;
  --cl-d: #322b1b;
  /* ... trimmed: the rest of the dark palette, same variable names. */
```

### Type

There is no numeric type scale. Two families are used:

- `'Delight'` — the brand face, self-hosted woff2 at weights 400/500/600/700/800.
  Used for headings, names, buttons, and anything that should feel like the
  product's voice.
- System sans (`-apple-system` stack via `'Helvetica Neue', Arial`) as fallback.

Sizes are set per component in `globals.css`. Representative values:

| Role | Size | Weight |
|---|---|---|
| Page heading (`h1`, `.acthead`) | 26px | 600 |
| Sheet heading (`.sheet h2`) | 22px | 600 |
| Class name in a row (`.ps-enm`) | 17px | 600 |
| Profile tab (`.pubtab`) | 17px | 600 |
| Body / row title (`.setrow .t`) | 16px | 500-600 |
| Secondary line (`.setrow .s`, `.sub`) | 13px | 400 |
| Day band (`.ps-dayname`) | 11-12px | 700, uppercase, wide tracking |

### Spacing, radii, shadows, breakpoints

- **Spacing** is ad hoc per component; there is no scale variable. The page
  gutter is the one constant: `.pad { padding: 20px 18px; }`, widening to 38px
  above the desktop breakpoint.
- **Radii:** `--radius: 16px` is the default for cards, inputs and sheets.
  Pills use `999px`. A studio's banner and avatar use a rounded rectangle where
  a person's uses `50%` — that shape difference is load-bearing (a place reads
  as a room, a person as a face).
- **Shadows:** `--soft-shadow` and `--soft-shadow-lg`, both warm-charcoal
  tinted. Floating controls use their shadow as their edge rather than a border.
- **Breakpoints:** `940px` is the main one (bottom tab bar hides, header nav
  takes over, page gutter widens). Desktop pointer affordances are gated on
  `(hover: hover) and (pointer: fine)` rather than width, so a tablet does not
  get mouse-only controls.

### Colour doctrine (important for any new screen showing classes)

Three relationships, three colours, stable everywhere:

- **Teaching** — brand orange `--si`
- **Going** — green `--go`
- **Personal** — blue `#3b82cc`

These are worn as a 4px accent bar down the left of a row, or a tinted pill on
the month grid. A fourth meaning must not borrow one of these three.

---

## 3. Reusable UI components

### Icon

Every glyph in the app. Lucide under the hood, mapped to app-specific names so
call sites read in the product's vocabulary. An unknown name renders a plain
circle rather than throwing, which means a typo ships silently.

`src/components/Icon.tsx`
```tsx
// Lucide under the hood, mapped to app names. An unknown name falls back to
// a plain Circle rather than throwing, so a typo ships as a blank button.
export function Icon({ name, size = 20 }: { name: string; size?: number }) { /* ... */ }
```

**Trimmed:** the 213-line import and map. The available names are:

```
account_circle, activity, add, admin_panel_settings, alternate_email, arrow_back, auto_awesome, bolt, bookmark, bookmark_added, calendar_month, calendar_today, call, campaign, chat, chat_bubble, check, chevron_left, chevron_right, close, content_copy, dark_mode, edit, event, event_added, event_available, expand_more, favorite, fingerprint, flag, groups, home, info, ios_share, light_mode, link, list, lock, mail, menu, more_horiz, name, north_east, notifications, open_in_new, palette, person_add, phone_iphone, place, public, public_off, qr_code_2, schedule, search, send, settings, share, shield, travel_explore, tune, verified, visibility
```


### Buttons

Base `.btn` plus a variant class. There is no Button component; buttons are
plain `<button>` elements with these classes.

```css
.btn        /* base: full width, 16px radius, 15px Delight 600 */
.btn.si     /* brand fill: orange background, white text. The primary action */
.btn.ghost  /* outline: transparent, 1.5px border. The secondary action */
.tertiary   /* text only, no chrome. Inline actions inside rows */
```

Usage, from the studio staff screen:

`src/components/StudioStaffView.tsx`
```tsx
<div className="publishwrap nostick">
  <button className="btn si" onClick={() => remove(id)}>
    Remove {confirm.name}
  </button>
  <button className="btn ghost" style={{ marginTop: 8 }} onClick={() => setConfirm(null)}>
    Keep them
  </button>
</div>
```

The filled button is drawn **first and loudest**; an outline button under a
filled one reads as a sentence backwards.

### Pills (profile actions)

Two slots on every profile header. A visitor sees Contact and Follow; the owner
sees Share and Edit profile. Same shapes, same weights, same spot.

```css
.actpill            /* base pill */
.actpill-primary    /* filled */
.followpill         /* the follow control; turns green (--go) when following */
```

`src/components/ContactSheet.tsx`
```tsx
<button className="actpill actpill-primary" onClick={() => setOpen(true)}>
  <Icon name="chat_bubble" size={17} /> Contact
</button>
```

### Chips

Two kinds, and they are not interchangeable.

`.chip` — a filter chip in a horizontal rail (`.dischips`). Fixed 38px height,
`sel` when picked. Multiselect. `All` leads the rail already filled in.

`src/components/DiscoverList.tsx`
```tsx
<button
  type="button"
  className={`chip${on ? " sel" : ""}`}
  aria-pressed={on}
  onClick={() => toggleType(d)}
>
  {d}
</button>
```

`TypePicker` — a chip **grid** for picking from a fixed vocabulary
(`STUDIO_TYPES`). Used by the studio editor, the coach's disciplines, and the
class type field. One vocabulary across all three, so the same word narrows
everything.

### Settings row (`.setrow`)

The workhorse row. Icon, two lines of text, and a trailing control (chevron,
switch, or nothing).

`src/components/MessagesToggle.tsx` (trimmed — representative of the whole family)
```tsx
"use client";

// Whether people can write to this coach from their public page. Separate from
// availability on purpose: availability answers "am I taking private clients",
// this answers "can anyone reach me at all".
export function MessagesToggle({ initialOn }: { initialOn: boolean }) {
  const [on, setOn] = useState(initialOn);
  // ... optimistic toggle, then setMessagesOpen(next) and router.refresh()
  return (
    <button className="setrow" onClick={toggle} aria-pressed={on}>
      <span className="setrow-ic"><Icon name={on ? "chat_bubble" : "public_off"} size={22} /></span>
      <span className="setrow-txt">
        <span className="t">Messages</span>
        <span className="s">
          {on ? "People can message you from your page" : "Off, no Message button on your page"}
        </span>
      </span>
      <span className={`switch${on ? " on" : ""}`} aria-hidden="true">
        <span className="switch-knob" />
      </span>
    </button>
  );
}
```

The switch is `.switch` / `.switch.on` with a `.switch-knob` inside, and the
button carries `aria-pressed` or `role="switch"` + `aria-checked`.

### Class row (`.ps-event`)

The single most reused component. One row on every list of classes: Following,
both calendars, a coach's public page, a studio's page, Discover's Classes half.

`src/components/Agenda.tsx` (the row, trimmed)
```tsx
      )}
    </div>
  );
}

/** The row itself: a link when something is behind it, a button otherwise. */
export function ClassRow({
  item,
  onClick,
  children,
}: {
  item: AgendaItem;
  onClick?: () => void;
  /** Anything the row says under the class name, like who else is going. */
  children?: ReactNode;
}) {
  const inner = (
    <>
      {/* The coach's colour on merged lists; on your own calendar the kind
          colours the bar through CSS, and an inline value would override it. */}
      <span
        className="ps-accent"
        style={item.kind ? undefined : { background: item.coachColor }}
        aria-hidden="true"
      />
      {/* Who first, then what, then where: on a list drawn from more than one
          coach, the coach is how you place the class. A personal entry has
          no coach to show, so its line above the name says whose it is. */}
      <span className="ps-ebody">
        {item.kind === "private" && (
          <span className="ps-private ps-shifttop ps-tag-added">Added by you</span>
        )}
        {item.coachName?.trim() && (
          <span className="ps-ecoach">
            <AgendaAvatar photo={item.coachPhoto} name={item.coachName} color={item.coachColor} />
            <span className="ps-ecoach-txt">{item.coachName}</span>
            {item.you && <span className="ps-youtag">You</span>}
          </span>
  // ... trimmed: the class name, the studio line, the tag, the time column,
  // and the return, which picks a plain <a> when there is an href, a
  // <button> when there is only a tap, and a non-interactive <div> for a
  // studio's community row.
}
```

Its item shape:

`src/components/Agenda.tsx`
```ts
export type AgendaItem = {
  /** Unique within the day. The caller's own id; this only keys the list. */
  key: string;
  name: string;
  hm: string;
  ap: string;
  durationMin: number;
  where?: string | null;
  coachName?: string | null;
  coachPhoto?: string | null;
  coachColor: string;
  /** The viewer teaches this one. */
  you?: boolean;
  /** A word in the time column: Added, Shift, Mine. */
  tag?: string | null;
  /** The viewer's relationship to the row, worn as the card's colour on
   *  their own calendar. Following passes none and keeps the paper. */
  kind?: "coaching" | "added" | "private" | null;
  /** Marked as going: the accent thickens. */
  on?: boolean;
  /** The real page behind it, when there is one. A row with a link is still a
   *  link, so a middle click and a crawler both get what they expect. */
  href?: string | null;
  /** A fact with nothing behind it: a studio's community row, distilled from
   *  members' entries. Not a link and not a button, because there is no page
   *  and nothing to press. */
  plain?: boolean;
  /** For ClassOpener, which reads these off the row rather than the list. */
  classId?: string;
  iso?: string;
  base?: string;
};
```

The Add control is a **sibling** of `.ps-event`, never a child, because a button
inside a link is not valid HTML:

`src/components/ClassCardActions.tsx`
```tsx
<button
  className={`evcard-add${on ? " on" : ""}`}
  aria-label={on ? "Added to your plans" : "Add to your plans"}
  aria-pressed={on}
  onClick={toggle}
>
  <Icon name={on ? "bookmark_added" : "bookmark"} size={20} />
  <span className="evcard-add-t">{on ? "Added" : "Add"}</span>
</button>
```

The glyph is a **bookmark ribbon**, not a heart. A heart says favourite; the tap
puts the class on a list called Plans. The word is always **Add**, never Save.

### Day band

The heading above a day's rows. Deliberately wins on the opposite axis to the
class names under it: small, uppercase, wide-tracked, with the day left and the
date right.

`src/components/Agenda.tsx`
```tsx
 * another entry, and making it bigger only sharpens the fight. So it goes the
 * other way: small, wide-tracked and uppercase against large, tight and
 * mixed-case, on a band of its own.
 *
 * The band is the paper colour rather than a darker cream: a strip that sinks
 * into the page reads as mud, and this one has to lift off it. Today's name
 * is the one spot of brand in the list.
 */
export function DayBand({
  iso,
  today,
  count,
}: {
  iso: string;
  today?: string;
  /** How many classes the day holds, across from its name. */
  count?: number;
}) {
  return (
    <div className={`ps-daycol${today && iso === today ? " ps-daycol-today" : ""}`}>
      <span className="ps-dayname">{dayBandLabel(iso, today)}</span>
      {count != null && (
        <span className="ps-daycount">
          {count} {count === 1 ? "class" : "classes"}
        </span>
```

It sticks at `--dayband-top`. **Any screen rendering these must call
`useBandTop()`** or the variable inherits a stale value from the previous screen
and the band pins halfway down the phone.

### Directory rows

A person and a place, shared between Discover and search.

`src/components/DirectoryRows.tsx` (PersonRow, trimmed)
```tsx
};

/** A person: the whole row links to their page, chevron in the corner.
 *  `kindTag` is off where the list holds one kind: Discover lists coaches
 *  only, so a Coach badge on every row would be saying nothing; search
 *  mixes kinds, and there the badge is the distinction that matters. */
export function PersonRow({
  person: c,
  from,
  kindTag = true,
  follow = false,
}: {
  person: DirPerson;
  from: string;
      {/* ... trimmed: the avatar branch (photo, or an initial on a derived
          colour) with the availability dot, the name line with its optional
          Coach tag, the tagline, and the classes-this-week line. Then, outside
          the Link because a button inside an anchor is invalid: */}
      {follow && (
        <RowFollow handle={c.handle} name={c.name} isCoach={c.kind === "coach"}
          following={c.following} requested={c.requested} />
      )}
    </div>
  );
}
```

### Bottom sheet

`.sheet` inside `.sheet-scrim`. Plain white (`--card`), not glass: it tried the
class overlay's tint and the rows went muddy. A `.settingslist` inside one drops
its own white block, because a white card inside a white card is a box drawn for
its own sake.

```tsx
<div className="sheet-scrim" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
  <div className="sheet">
    <button className="iconbtn sheetclose" aria-label="Close" onClick={close}>
      <Icon name="close" size={16} />
    </button>
    <h2>Title</h2>
    <p className="lead">Supporting line.</p>
    {/* rows or form */}
  </div>
</div>
```

`.sheet.infosheet` is the read-only explainer variant (larger lead text).
`.sheet.confirmsheet` is the destructive-confirm variant: what happens, the
doing button (`.btn.si`), then the way out (`.btn.ghost`).

**Stacking trap:** the tab bar is `z-45`, sheets are `z-46`. A sheet rendered
inside a positioned layer (the account view as an overlay, a profile header
slot) gets trapped underneath. Those portal to `document.body`. Do not add a
`z-index` to `.profback` or `.ownertop` — they deliberately own no stacking
layer.

### Avatar

`AgendaAvatar` for rows, `AvatarZoom` for a profile head. No photo falls back to
an initial on a derived colour from a fixed palette of sixty (`avatarColor(user)`).
A studio has no picker, so its derived colour is the only one it can have.

### Badges and toggles

- `VerifiedBadge` — Verified / Unverified on a studio, tapping opens a sheet
  explaining what it means and how to claim the page.
- `.kindtag` — a small label beside a name (Coach, Schedule).
- The availability badge on a profile photo: a white pill with a coloured dot,
  tappable, opening an explainer with a Message door.

### Toast

`useToast()` returns `[msg, on, toast]`. Render `<Toast msg={msg} on={on} />`.
A toast rendered inside a sheet unmounts with it and is never seen, so it
belongs to whoever opened the sheet.

---

## 4. Class detail page

The class opens two ways and they share one component: as a **sheet** over
whatever list you tapped, and as a **page** at `/{handle}/{classId}` so a shared
link opens something real. `classDetail()` is the one loader both use, so the
occurrence rule cannot drift between them.

A gym's class lives at `/s/{slug}/{classId}` instead, because a gym account has
no handle.

### The route

`src/app/[handle]/[classId]/page.tsx` (full)
```tsx
import type { Metadata } from "next";
import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb, schema } from "@/db";
import { fmtTime, siteOrigin } from "@/lib/format";
import { getSessionUserId } from "@/lib/session";
import { viewerLook } from "@/lib/look";
import { classDetail } from "@/app/actions/classdetail";
import { ClassPage } from "@/components/ClassPage";

export const dynamic = "force-dynamic";

// ... trimmed: generateMetadata(), which builds the OG title/description and
// points at /api/card/class/{id} for the share image.
// what this viewer may see (private stays owner-only, blocked sees nothing,
// ?d= pins the occurrence), and ClassSheet renders it exactly as the lists
// do. The shell's own job is the 404, the coach's theme, and where back goes.
export default async function EventPage({ params, searchParams }: Props) {
  const { handle, classId } = await params;
  const { d: dParam, from } = await searchParams;
  if (!UUID_RE.test(classId)) notFound();

  const db = await getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.handle, handle));
  if (!user) notFound();

  const detail = await classDetail(handle, classId, dParam);
  if (!detail) notFound();

  const viewerId = await getSessionUserId();

  // Back goes where you actually came from: off the Following tab it returns
  // there, off Home it returns home, and a cold open falls back to the
  // coach's schedule.
  const backHref =
    from === "home" ? "/home" : from === "following" ? "/feed" : `/${handle}/schedule`;
  const backLabel =
    from === "home"
      ? "Back home"
      : from === "following"
        ? "Back to Following"
        : `Back to ${user.name}’s schedule`;

  return (
    <div className="pub evpage" data-theme={user.theme} data-mode={await viewerLook()}>
      <ClassPage
        detail={detail}
        backHref={backHref}
        backLabel={backLabel}
        claimVia={viewerId ? null : handle}
      />
    </div>
  );
}

```

### The data contract

This is the shape the screen renders. Read this before proposing changes: most
of what a designer needs to know about what the screen can and cannot say is
encoded here.

`src/app/actions/classdetail.ts` (the type, full)
```ts
export type ClassDetail = {
  id: string;
  handle: string;
  coachName: string;
  coachPhoto: string | null;
  coachColor: string;
  name: string;
  classType: string | null;
  description: string | null;
  image: string | null;
  whenIso: string;
  dateLong: string;
  time: string;
  durationMin: number;
  studioName: string | null;
  studioAddress: string | null;
  studioHref: string | null;
  location: string | null;
  links: { label: string; url: string }[];
  shareUrl: string;
  /** Calendar doors for the overflow menu, same targets as the class page. */
  googleUrl: string;
  icsHref: string;
  /** The viewer's own handle, so a share can say who's going. */
  myHandle: string | null;
  /** Whether this viewer can add it: signed in, not theirs, and public. */
  canAdd: boolean;
  added: boolean;
  /** Whether that mark is one the viewer's followers can see. Null when
   *  there is no mark to have an opinion about. The moment of adding used to
   *  be the only place this could be set, which meant it could not be changed
   *  afterwards at all; the sheet the class already opens in is where it can
   *  be both seen and changed. */
  addedPublic: boolean | null;
  /** It's been and gone: say so rather than showing a button that fails. */
  past: boolean;
  /** The viewer is the admin: the sheet offers to change the picture. A beta
   *  power for filling in the catalog; it touches the photo and nothing else. */
  adminPhoto: boolean;
  /** The admin may hand this class a booking link, because it has none. */
  adminLink: boolean;
  /** Who marked Going on this occurrence. Owner only: they marked it at this
   *  coach, so the coach can see them; nobody else gets the list. */
  roster: { name: string; photo: string | null; color: string; handle: string | null }[] | null;
  /** The owner is a gym, not a person. Nothing here is "coached by" anybody:
   *  whether a coach's name is ever shown is the gym's own switch, and it is
   *  off. The studio row below says where, which is the whole truth of it. */
  // ... trimmed: adminPhoto, adminLink, roster, ownerIsGym and the shift
  // object. Roster is owner-only and null for everyone else; shift is null
  // for anyone with no standing at the gym.
};
```

### The screen

`src/components/ClassSheet.tsx` is 924 lines. **Trimmed below:** the handler
bodies (`toggle`, `share`, `sendReport`, `pickAdminPhoto`, `saveAdminLink`,
`act`, `send`) and the admin photo/link sheets, the report sheet, the shift
management sheets, and the booking sheet. What is kept is the full component
signature, the state, and the whole render tree, which is what governs layout.

`src/components/ClassSheet.tsx` (signature and state)
```tsx
export function ClassSheet({
  handle,
  classId,
  iso,
  onClose,
  onChanged,
  initial,
  backLabel,
  claimVia,
}: {
  handle: string;
  classId: string;
  /** The occurrence that was tapped, so a weekly class opens on the right day. */
  iso?: string;
  onClose: () => void;
  /** Fired after a save or a remove, so the list behind can catch up. */
  onChanged?: (added: boolean) => void;
  /** The page hands its server-loaded detail in, skipping the client fetch. */
  initial?: ClassDetail;
  /** Names where back goes when the circle is a page's only way out. */
  // ... trimmed: the state. 18 useState hooks, one per sheet this screen can
  // open (book, more, report, card, admin photo, admin link, shift manage,
  // transfer, confirm), plus a toast and two transitions.
```

`src/components/ClassSheet.tsx` (the render tree — floating chrome)
```tsx
  return (
    <div className="classoverlay">
      <button className="ovcircle ovcircle-back" aria-label={backLabel ?? "Back"} onClick={onClose}>
        <Icon name="arrow_back" size={19} />
      </button>
      {c && (
        <button className="ovcircle ovcircle-share" aria-label="Share this class" onClick={share}>
          <Icon name="ios_share" size={18} />
        </button>
      )}
      {/* The overflow: everything you might do with a class that isn't the
          class's own two buttons. */}
      {c && (
        <div ref={moreRef}>
          <button
            className="ovcircle ovcircle-more"
            aria-label="More"
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen((o) => !o)}
          >
            <Icon name="more_horiz" size={18} />
          </button>
          {moreOpen && (
            <div className="ovmenu" role="menu">
              <a
      {/* ... trimmed: the share circle and the overflow menu beside it. */}
```

`src/components/ClassSheet.tsx` (the body: photo, name, coach, facts)
```tsx
      <div className="classoverlay-scroll">
      {missing ? (
        <div className="classoverlay-body">
          <p className="lead" style={{ textAlign: "center", marginTop: "30vh" }}>
            That class isn&rsquo;t there any more.
          </p>
        </div>
      ) : !c ? (
        // A blank beat rather than a spinner: the overlay is already open and
        // the data lands in a moment.
        <div className="classoverlay-body" aria-hidden="true" />
      ) : (
        <div className="classoverlay-body">
          {/* The picture, when there is one: full bleed across the top of the
              sheet, the same way a profile leads with a face. A class without
              one reads exactly as it did, which is the point of it staying
              optional. */}
          {c.image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="classoverlay-img" src={c.image} alt="" />
          )}
          {/* A dated link that has been and gone has to say so before the
              class reads as something you can still turn up to, so it says it
              where the eye lands: between the photograph and the listing,
              rather than in a grey line under the description where it was
              read after everything it qualifies. A quiet brand wash, because
              it is a fact about the date and not a warning. */}
          {c.past && !added && (
            <p className="classsheet-gone">
              <Icon name="schedule" size={16} />
              This one has already run.
            </p>
          )}
          {c.classType && <span className="evtype classoverlay-type">{c.classType}</span>}
          <h2 className="classoverlay-nm">{c.name}</h2>
          {/* Whose class it is, as a face and a name, and a way to them: from
              the feed or your saves this is often the first time you meet a
          {/* ... then, in order: the class name (.classoverlay-nm), the coach
              row linking to /{handle} (.classoverlay-coach, dropped entirely
              when the owner is a gym, because nobody is coached by a company),
              the facts block (.evfacts: time, duration, studio, location as
              label/value rows), and the description (.classoverlay-desc). */}
```

`src/components/ClassSheet.tsx` (the visibility row and the roster)
```tsx
          {/* The visibility row: a .setrow with a switch, shown only when the
              viewer has marked this occurrence. Reads "Followers can see it".
              Calls setGoingVisibility(). */}
          {c.roster && (
            <div className="classsheet-roster">
              <h3 className="classsheet-roster-h">
                Going{c.roster.length > 0 ? ` · ${c.roster.length}` : ""}
              </h3>
              <Roster people={c.roster} />
            </div>
          )}
```

`src/components/ClassSheet.tsx` (the bottom action pill)
```tsx
          their own shift: the date is theirs to manage, not to book. */}
      {c && (isOwner || c.shift?.canGiveUp || showBook || c.canAdd) && (
        <>
          <div className="classoverlay-cta">
            {isOwner ? (
              <Link className="ovcta-btn" href={`/app?edit=${c.id}&d=${c.whenIso}`}>
                <Icon name="edit" size={17} /> Edit this class
              </Link>
            ) : c.shift?.canGiveUp ? (
              <button className="ovcta-btn" onClick={() => setManageOpen(true)}>
                <Icon name="person_add" size={17} /> Manage shift
              </button>
            ) : (
              <>
                {showBook && (
                  <button className="ovcta-btn" onClick={() => setBookOpen(true)}>
                    Book
                  </button>
                )}
                {showBook && c.canAdd && <span className="ovcta-div" aria-hidden="true" />}
                {c.canAdd && (
                  <button
                    className={`ovcta-btn ovcta-save${added ? " on" : ""}`}
                    disabled={pending}
                    aria-pressed={added}
                    aria-label={added ? "In your plans" : "Add to your plans"}
          {/* ... trimmed: the shift controls (Manage shift for a coach on a
              gym's rota, Open shift for one who could take it) and the sheets
              behind Book, report, transfer and the admin doors. Each is a
              standard .sheet inside a .sheet-scrim. */}
```

### Components only this screen uses

`src/components/Roster.tsx` (full)
```tsx
import Link from "next/link";
import { Icon } from "@/components/Icon";

// Who marked Going on one occurrence, for the coach who owns it. They marked
// it at this coach, so the coach seeing them is what the mark meant; nobody
// else is ever handed this list.
export type RosterPerson = {
  name: string;
  photo: string | null;
  color: string;
  handle: string | null;
};

function Face({ p }: { p: RosterPerson }) {
  return p.photo ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img className="rosterrow-av" src={p.photo} alt="" />
  ) : (
    <span className="rosterrow-av rosterrow-av-empty" style={{ background: p.color }} aria-hidden="true">
      {(p.name.trim().charAt(0) || "?").toUpperCase()}
    </span>
  );
}

export function Roster({ people }: { people: RosterPerson[] }) {
  if (people.length === 0) {
    return <p className="rosternone">Nobody has marked Going for this one yet.</p>;
  }
  return (
    <div className="roster">
      {people.map((p, i) =>
        p.handle ? (
          <Link key={i} className="rosterrow" href={`/${p.handle}`}>
            <Face p={p} />
            <span className="rosterrow-nm">{p.name}</span>
            <span className="rosterrow-chev">
              <Icon name="chevron_right" size={16} />
            </span>
          </Link>
        ) : (
          <div key={i} className="rosterrow">
            <Face p={p} />
            <span className="rosterrow-nm">{p.name}</span>
          </div>
        ),
      )}
    </div>
  );
}

```

### Layout rules that will bite

- **The overlay scrolls inside a layer, never on itself.** The backdrop blur
  makes `.classoverlay` the containing block for every `position: fixed`
  descendant, so when the overlay was its own scroller the back/share circles
  and the bottom pill scrolled away with the content. The scroll lives in
  `.classoverlay-scroll`; the fixed chrome stays put.
- **The photo runs to the very top edge** (`.classoverlay-img` swallows the
  body's top padding and the safe area with a negative margin). The circles sit
  on the picture, not in a band of paper above it.
- While any overlay is up, `ScrollLock` freezes the page behind it.

---

## 5. The Going model

"Going" is a personal note, not a reservation. **Nothing here talks to a
studio's booking system, and the copy must never imply it does.** Booking links
are a separate thing that live on the class detail.

The word in the UI is **Add** / **Added**, never Save. The glyph is a bookmark
ribbon.

### The record

`src/db/schema.ts`
```ts
export const attendances = pgTable(
  "attendances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id),
    classId: uuid("class_id").notNull().references(() => classes.id),
    // The specific day they're going. Classes are recurring templates, so
    // without a date "going" would mean every future Tuesday forever.
    occurrenceDate: date("occurrence_date").notNull(),
    // "With Joanne and Dave": names, not accounts. Naming who you're bringing
    // is telling the front desk, so these show exactly where the roster shows
    // (the coach and fellow goers) and nowhere public. Not users references,
    // on purpose: the friend without the app is still a person in the room.
    companions: jsonb("companions").$type<string[]>().notNull().default([]),
    // Whether the mark shows to people who follow you: Home's Activity, an
    // Upcoming card's "also going" line. Public by default, because a feed
    // of nobody doing anything is no feed at all; the moment of marking
    // says so out loud and offers the way off, and off means the mark shows
    // only where it always did (the coach's roster, your own week).
    isPublic: boolean("is_public").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("attendances_user_class_date").on(t.userId, t.classId, t.occurrenceDate)],
);

```

The unique index on `(user_id, class_id, occurrence_date)` is what makes a mark
mean one Tuesday rather than every future Tuesday.

### The server actions

There are no REST routes. Both of these are server actions.

`src/app/actions/going.ts` (setGoing kept whole; setGoingVisibility summarised)
```ts
"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { isBlocked } from "@/lib/blocks";
import { occurrenceEnded } from "@/lib/format";
import { getSessionUserId } from "@/lib/session";

// Adding a class is a personal note, not a reservation. Nothing here talks to
// a studio's booking system, and the copy around it must never imply it does.
// The date matters: classes recur, so this marks one Tuesday, not every one.
export async function setGoing(
  classId: string,
  occurrenceDate: string,
  on: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Sign in first." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(occurrenceDate)) return { ok: false, error: "Bad date." };
  const db = await getDb();
  const [cls] = await db.select().from(schema.classes).where(eq(schema.classes.id, classId));
  if (!cls || !cls.isPublic) return { ok: false, error: "Class not found." };
  // Your own classes show up on your Home alongside the ones you follow, so
  // this is reachable — you teach it, you're not attending it.
  // Your own classes show up alongside the ones you follow, and so do the
  // shifts you're on at a gym: the class belongs to the gym, so the owner test
  // alone would let a coach mark themselves down for a class they're teaching.
  if (cls.userId === userId || cls.coachUserId === userId)
    return { ok: false, error: "You aren’t able to attend your own class." };
  // A coach who blocked you has no schedule as far as you're concerned, so
  // there's nothing here to add. Same wording as a class that isn't there.
  if (await isBlocked(cls.userId, userId)) return { ok: false, error: "Class not found." };
  // Adding is only ever forward. Taking one back out stays allowed whatever the
  // date: removing something you didn't get to isn't a thing to be stopped from
  // doing, and the list clears itself as the week passes anyway.
  if (on && occurrenceEnded(occurrenceDate, cls.startTime, cls.durationMin)) {
    return { ok: false, error: "That class has already started." };
  }

  if (on) {
    await db
      .insert(schema.attendances)
      .values({ userId, classId, occurrenceDate })
      .onConflictDoNothing({
        target: [
          schema.attendances.userId,
          schema.attendances.classId,
          schema.attendances.occurrenceDate,
        ],
      });
  } else {
    await db
      .delete(schema.attendances)
      .where(
        and(
          eq(schema.attendances.userId, userId),
          eq(schema.attendances.classId, classId),
          eq(schema.attendances.occurrenceDate, occurrenceDate),
        ),
      );
  }
  revalidatePath("/feed");
  revalidatePath("/app");
  return { ok: true };
}
  // ... trimmed: the delete branch (same three-column where clause) and the
  // revalidatePath calls for /feed and /app.
}

// The way off being seen: a mark is public to your followers by default
// (Home's Activity and the "also going" lines are made of them), and the
// toast that announces the mark carries this switch, so the choice sits in
// the moment rather than in settings. Off never touches where the mark
// always showed: the coach's roster and your own week.

export async function setGoingVisibility(
  classId: string,
  occurrenceDate: string,
  isPublic: boolean,
): Promise<{ ok: boolean; error?: string }> {
  // Updates attendances.isPublic for that one occurrence. Off never touches
  // the coach's roster or the viewer's own week.
}
```

### Where it renders

| Surface | What it shows |
|---|---|
| Any class row (`.ps-event`) | The Add ribbon, filled when marked |
| Class sheet / page | The bottom pill's Add, plus the visibility row |
| Class sheet, **owner only** | `roster`: who marked Going on this occurrence |
| Home → Upcoming | Your own next seven days of marks |
| Home → Activity, `/activity` | Other people's public marks |
| Home → Upcoming card | `alsoGoing`: mutual follows going to the same one |
| A member's `/week` | Their own marks as calendar rows |

### Public vs private, and how it is enforced

- A mark is **public by default** (`is_public` defaults true). This is a
  deliberate product decision: Activity and the "also going" lines are made of
  these marks, and a feed of nobody doing anything is no feed at all.
- **Public means: to people who follow you.** Not the world. It never shows
  where else you train beyond the marked class.
- **Turning it off never touches** the coach's roster or your own week. The mark
  always showed there and still does.
- **The coach's roster is owner-only.** `classDetail()` returns `roster: null`
  for everyone else. The mark was made *at* that coach, so the coach seeing it
  is what the mark meant.
- **Personal entries can never be public.** They live in a separate table
  (`personal_classes`) with no column that could publish them. This is
  structural, not a flag, so the wall cannot be left open by accident.
- **Blocked in either direction** means the class does not exist as far as the
  other person is concerned, and `setGoing` returns "Class not found."
- **You cannot attend your own class**, and a coach cannot attend a shift they
  are on at a gym.

### Two people going to the same class

Today, nothing collides and nothing is capped:

- Each person gets their own `attendances` row; the unique index is per user.
- **There is no capacity, no spots-left, no waitlist.** Studios run their own
  booking. Rendering availability is explicitly out of scope.
- The **coach** sees both names in `roster` on the class sheet.
- **Each member sees the other only if they follow each other.** The
  `alsoGoing` line on Home's Upcoming card is gated on a mutual follow. A
  one-way follow surfaces nothing. Agreeing to each other is the consent.
- On a **public class page**, a visitor sees no count and no names at all.
  There is no public attendee number anywhere in the app.

---

## 6. Related models

`src/db/schema.ts` — the definitions, relationships noted inline.

### User (one table for coaches, members and gym accounts)

```ts
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  // "coach" (default) or "fan" — one identity system, two hats. A fan becomes
  // a coach by claiming a handle; a coach can follow like any fan.
  kind: text("kind").notNull().default("coach"),
  email: text("email").notNull().unique(),
  // scrypt password hash ("salt:hash"). Null for accounts that only ever used
  // a magic link or a passkey, which stay fully password-less.
  passwordHash: text("password_hash"),
  name: text("name").notNull().default(""),
  handle: text("handle").unique(),
  // Public profile: a short bio and a photo (stored as a small data URL).
  about: text("about"),
  photo: text("photo"),
  // A short role/tagline shown under the name (e.g. "Strength coach").
  title: text("title"),
  // City / area shown under the name on the public profile (e.g. "Jersey City").
  location: text("location"),
  // Compact credential chips shown on the profile (e.g. "NASM CPT", "HYROX Coach").
  certifications: jsonb("certifications").$type<string[]>().notNull().default([]),
  // "What to Expect" — a few short descriptors of the coach's style/vibe.
  highlights: jsonb("highlights").$type<string[]>().notNull().default([]),
  // Taking new private clients? "accepting" | "waitlist" | null (not shown).
  availability: text("availability"),
  // Optional contact + social links surfaced as buttons on the public profile.
  instagram: text("instagram"),
  website: text("website"),
  contactEmail: text("contact_email"),
  phone: text("phone"),
  whatsapp: text("whatsapp"),
  // Where this account came from. Stamped at creation off the first-touch
  // fl_src cookie (referrer host, utm tag, via handle; see src/middleware.ts),
  // ... trimmed: photo, avatarColor, location, title, about, disciplines,
  // certifications, highlights, availability, messagesOpen, discoverable,
  // approveFollowers, shiftsPublic, look, notification prefs, invite state,
  // and the auth columns. All flat columns on this one table.
});
  // ... trimmed: notification prefs, google/calendar fields, look/theme,
  // invite banner state, availability, certifications, highlights, profile
  // links, and the auth columns. Same shape: flat columns on one table.
});

```

`kind` is the discriminator: `"coach"`, `"fan"` (a member — the value is the odd
one out, everything a person reads says member), or `"gym"` (a studio's own
account: no handle, nobody signs in, it exists so a gym's classes have an owner
that is not a person).

**A handle is not a coach badge.** Members claim one too. Anything asking "is
this a coach?" must test `kind`.

### Studio

```ts
export const studios = pgTable("studios", {
  id: uuid("id").primaryKey().defaultRandom(),
  seq: serial("seq").notNull().unique(),
  // URL for the studio's own page. Derived from the name, unique across the
  // directory; the id is the fallback for anything created before slugs.
  slug: text("slug").unique(),
  name: text("name").notNull(),
  address: text("address").notNull(),
  // What kind of gym it is — a studio is usually more than one thing.
  types: jsonb("types").$type<string[]>().notNull().default([]),
  photo: text("photo"),
  about: text("about"),
  contactEmail: text("contact_email"),
  phone: text("phone"),
  website: text("website"),
  instagram: text("instagram"),
  createdByUserId: uuid("created_by_user_id").references(() => users.id),
  // The gym's own account, once it runs its schedule here. A users row with
  // kind "gym": no handle, no password, nobody signs into it. It exists so the
  // gym's classes have an owner that isn't a person, which is the whole reason
  // [a coach] can teach without a public profile and [a manager] can publish a
  // schedule without naming anyone. Its managers act for it; see studio_managers.
  accountUserId: uuid("account_user_id").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// One date's exception to the rota: who is actually on this class this week.
//
// A gym class is a standing slot, so `classes.coachUserId` says who normally
// teaches it. Real weeks aren't like that: somebody is away, somebody swaps,
// somebody picks up a shift nobody was on. That's one date, not a change to
// the class, and writing it onto the class row would rewrite every week.
//
// A row here wins over the class for that date. coachUserId null is the open
// state, said out loud: the slot runs and nobody is on it yet. Setting the date
// back to the regular coach deletes the row rather than storing a no-op, so the
// table only ever holds real exceptions.
```

### Class

```ts
export const classes = pgTable(
  "classes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id),
    // Autofill memory for a class NAME, one row per (coach, name). Two classes
    // that share a name share this, so it can't identify a recurring set.
    templateId: uuid("template_id").references(() => classTemplates.id),
    // Which recurring class this row is a weekday of. A weekly class is one row
    // per weekday and they all carry the same seriesId; a one-off gets its own.
    // This, not templateId, is what "the whole series" means when editing or
    // deleting: a coach teaching Stretch+ at two studios has two series and one
    // template, and grouping by the template collapsed them into one class.
    seriesId: uuid("series_id").notNull().defaultRandom(),
    // Who is teaching it, when the owner is a gym rather than a person. The
    // class belongs to the gym (userId); this is the rota. It drives the
    // shift, the notification and the calendar, and whether the name is ever
    // shown in public is a separate question with two people's say in it.
    // Null on an ordinary coach's own class, and on a gym slot nobody covers.
    coachUserId: uuid("coach_user_id").references(() => users.id),
    dayOfWeek: integer("day_of_week").notNull(),
    // null = standing weekly (shows every week, link never stales); set = a
    // one-off pinned to this ISO date, shown only in the week it falls in.
    specificDate: date("specific_date"),
    // Last date a standing weekly class runs (inclusive). null = no end, the
    // original behaviour. Ignored for one-offs, which are their own date.
    endsOn: date("ends_on"),
    // ISO dates this weekly class does NOT run — "I'm off this Friday". Kept on
    // the row rather than in an exceptions table so runsOn() sees them for free
    // at every one of the places that expand a recurrence.
    skipDates: jsonb("skip_dates").$type<string[]>().notNull().default([]),
    startTime: text("start_time").notNull(), // "HH:MM" 24h
    durationMin: integer("duration_min").notNull(),
    // ... trimmed: description, image, links, location, classType, endsOn,
    // specificDate, skipDates, seriesId, templateId.
  // ... trimmed: skipDates, endsOn, specificDate, links, image, seriesId
  // and templateId, plus their comments.
});
```

`classes.userId` is the owner (whose schedule it is). `classes.coachUserId` is
**the rota**: for a gym's class, who is teaching it. That split is the one
inversion the whole gym feature rests on.

`seriesId` identifies one recurring class; all its weekday rows share it.
`templateId` is only autofill memory. They are not the same thing, and grouping
by the template is what once let an edit to one class delete another.

### Personal class (a member's own entry, never public)

```ts
export const personalClasses = pgTable("personal_classes", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  dayOfWeek: integer("day_of_week").notNull(), // 0 = Monday, same as classes
  startTime: text("start_time").notNull(), // "HH:MM", floating, same as classes
  durationMin: integer("duration_min").notNull().default(60),
  location: text("location").notNull().default(""),
  withWho: text("with_who").notNull().default(""),
  // The place, when it's a place in the directory rather than free text. This
  // is also the gate on the catalog write: a class at a studio is a fact about
  // that studio, a 1:1 in somebody's garage is not.
  studioId: uuid("studio_id").references(() => studios.id),
  classType: text("class_type"),
  description: text("description"),
  image: text("image"),
  // How you book it. ClassPass, Mindbody, the studio's own page: yours alone,
  // and the reason a plan is worth opening twice.
  links: jsonb("links").$type<BookingLink[]>().notNull().default([]),
  // Set = a one-off on this date, and `dayOfWeek` is only its weekday. Null =
  // it repeats. Same pair, same meaning, as on `classes`.
  specificDate: text("specific_date"),
  endsOn: text("ends_on"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// "This class isn't right": not a real class, wrong time, wrong place. Keyed
// on the seriesId rather than a class row, because an edit deletes and
// reinserts the rows and a delete removes them; the report is about the class
// as a person understands it, and the series is that. No FK on the series (it
// has no table), so nothing here can make an edit fail. One report per person
// per class; a second tap changes nothing, which is also what it should do.
```

### Follow

```ts
export const subscribers = pgTable(
  "subscribers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    trainerUserId: uuid("trainer_user_id").notNull().references(() => users.id),
    email: text("email").notNull(),
    // Set when the follow came from a signed-in account (the fan side); null
    // for plain email subscribers. Same table, one digest pipeline.
    userId: uuid("user_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    optedOutAt: timestamp("opted_out_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("subscribers_trainer_email").on(t.trainerUserId, t.email),
    // "Who do I follow" is asked by email on every feed, week, and profile
    // load; the unique index above leads with the trainer, so it can't serve
    // that lookup.
    index("subscribers_email").on(t.email),
  ],
);

// "I'm going" — a member marking a class they intend to attend. Deliberately
// NOT a booking: most classes are reserved through the studio, so this is a
// personal note that drives their week and their share image, nothing more.
```

A follow is keyed on **email**, not user id, because email subscribers predate
accounts. A follow is private: nothing public says who a member follows.

```ts
export const followRequests = pgTable(
  "follow_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    trainerUserId: uuid("trainer_user_id").notNull().references(() => users.id),
    requesterUserId: uuid("requester_user_id").notNull().references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("follow_requests_once").on(t.trainerUserId, t.requesterUserId)],
);

```

### Shift cover (one date, not a change to the class)

```ts
export const shiftCovers = pgTable(
  "shift_covers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    classId: uuid("class_id").notNull().references(() => classes.id),
    occurrenceDate: date("occurrence_date").notNull(),
    /** Null means nobody is on it that day: open, and asking to be picked up. */
    coachUserId: uuid("coach_user_id").references(() => users.id),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("shift_covers_once").on(t.classId, t.occurrenceDate)],
);

// Who a shift can be handed to. Anyone may say they coach at a gym (the
// directory runs on trust), but not everyone listed there teaches the group
// classes on the rota, so the managers name the pool: a coach handing a date
// on picks from these people and nobody else. Its own table rather than a
// flag on coach_studios because that row is the coach's own claim about
// themselves, and this is the gym's claim about the coach.
  // ... trimmed: the comment block explaining that a cover wins over the
  // class for one date, and that a null coach means the slot runs open.
);
```

### Studio staff

```ts
export const studioRotaCoaches = pgTable(
  "studio_rota_coaches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studioId: uuid("studio_id").notNull().references(() => studios.id),
    userId: uuid("user_id").notNull().references(() => users.id),
    /** active | invited | placeholder | unconfirmed. */
    state: text("state").notNull().default("active"),
    /** Where the invite went, for a resend. Null once they are on. */
    invitedEmail: text("invited_email"),
    invitedPhone: text("invited_phone"),
    invitedAt: timestamp("invited_at", { withTimezone: true }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    /** Why they are in the unconfirmed pile: "claimed" (they had classes here
     *  when the studio took the page) or "asked" (they requested it). It
     *  changes the wording of the decline, which is not the same act in the
     *  two cases: declining a coach who added classes only unpicks the
     *  studio, it never touches their classes. */
    source: text("source"),
  // ... trimmed: the status vocabulary comments and studioManagers, which
  // is a plain (studio_id, user_id, added_by_user_id) join table.
);
```

---

## 7. Notifications

### In-app: yes

A `notifications` table, rendered at `/updates`, with an unread count on the
header bell.

`src/db/schema.ts`
```ts
// A coach's activity feed. Today it's just "someone followed you"; the type +
// jsonb data shape leaves room for more kinds later without new columns.
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id), // the coach who receives it
    // Who it's about, when it's about a person. Null for an email subscriber
    // with no account, and for anything that isn't somebody doing something.
    // It's a reference rather than a copied photo so the face stays current.
    actorUserId: uuid("actor_user_id").references(() => users.id),
    type: text("type").notNull(), // "follow" (more later)
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    href: text("href"), // where tapping it should go, if anywhere
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("notifications_user_created").on(t.userId, t.createdAt)],
);

```

Sending lives in `src/lib/notify.ts`, called as `addNotification(userId, {...})`.
An existing payload, from a gym assigning a shift:

`src/app/actions/gym.ts`
```ts
await addNotification(user.id, {
  type: "studio_manager",
  title: `You run ${studio.name} on fittlist`,
  body: "You can edit its page, and its details are yours to state.",
  href: `/s/${studio.slug ?? studio.id}`,
});
```

`type` drives the icon through a lookup table in `UpdatesScreen`. **A type with
no entry in that table renders a blank circle** and nothing complains — this is
how every notification row rendered an empty icon for months.

### Web push: exists, but not as a user-facing channel

`web-push` is a dependency and there is a `push_subscriptions` table, but the
transport has exactly one job today: ping the **admin's** phone when somebody
signs up.

`src/lib/push.ts`
```ts
import { eq, inArray } from "drizzle-orm";
import webpush from "web-push";
import { getDb, schema } from "@/db";
import { adminEmails } from "@/lib/admin";

// Web push, one job: ping the admin's phone when someone new joins. The VAPID
// pair lives in env (generate once with `npx web-push generate-vapid-keys`);
// without it the whole feature quietly sits out, the toggle included.
export function vapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY || null;
}

function configured(): boolean {
  return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

/** Send to every subscribed admin device. Dead subscriptions (the browser
 *  revoked or the app was uninstalled) come back 404/410 and are pruned, so
 *  the table can't fill with ghosts. Failures never propagate: a push is a
 *  nicety, and signup must not care whether it landed. */
export async function pushToAdmins(payload: {
  title: string;
  body: string;
  url: string;
}): Promise<void> {
  if (!configured()) return;
  webpush.setVapidDetails(
    `mailto:${process.env.MAIL_REPLY_TO || "hello@fittlist.co"}`,
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
```

Without `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` in env the feature sits out
entirely, toggle included. **There is no push to members or coaches.** Anything
a design assumes about "notify the user on their phone" is not built.

### Email

Transactional email exists (magic links, digests, inquiry replies) via
`src/lib/notifier.ts`. A merged weekly digest goes to followers.

---

## 8. Invites

The beta gate covers everyone, coaches and members alike, and is on unless
`INVITE_ONLY` is literally `"false"`.

### The share link

One permanent link per account: `fittlist.co/j/{code}`. No email needed in
advance.

`src/lib/joinlink.ts` (trimmed)
```ts
import { randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDb, schema } from "@/db";
import { siteOrigin } from "@/lib/format";

// The share link: fittlist.co/j/{code}.
//
// One link per account, permanent, no email involved. Somebody sends it, and
// whoever opens it can create an account even though the beta gate is up. The
// gate still means something: you can't get in without a link from someone who
// is already here. It just stops being a list of addresses we have to be told
// in advance.
//
// Opening the link only sets a cookie. Nothing is created until they actually
// sign up, so a link shared into a group chat costs nothing when it's ignored,
// and the same link works for as many people as it reaches.

/** Where the code lives between opening the link and finishing signup. */
const COOKIE = "fl_join";
const COOKIE_DAYS = 30;

// Ambiguity-free alphabet: no 0/O, no 1/I/l. These get read aloud and typed by
// hand, and a code somebody can't dictate is a code that loses people.
const ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";
const LENGTH = 8;

function mint(): string {
  const bytes = randomBytes(LENGTH);
  let out = "";
  for (let i = 0; i < LENGTH; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}
// ... trimmed: joinCodeFor() (mints and stores the code, retrying on
// collision), joinUrl(), inviterByCode(), rememberJoin(), pendingInviter()
// and clearJoin(). All cookie plumbing; the shape is above.
```

### How a signup is attributed

Opening the link only sets a cookie; nothing is created until the person
actually signs up. At signup, an `invites` row is written naming the inviter.

`src/lib/invites.ts`
```ts
// my link" and the admin's referral view the same question with one answer.
export async function acceptInvite(emailRaw: string, userId: string): Promise<void> {
  const email = norm(emailRaw);
  try {
    const db = await getDb();
    const stamped = await db
      .update(schema.invites)
      .set({ acceptedUserId: userId, acceptedAt: new Date() })
      .where(and(eq(schema.invites.email, email), isNull(schema.invites.acceptedAt)))
      .returning({ id: schema.invites.id });
    if (stamped.length) return;
    const via = await pendingInviter();
    if (!via) return;
    await db
      .insert(schema.invites)
      .values({
        email,
        label: `via ${via.name.trim() || "a share link"}'s link`,
        invitedByUserId: via.id,
        acceptedUserId: userId,
        acceptedAt: new Date(),
      })
      .onConflictDoNothing({ target: schema.invites.email });
  } catch {
    /* never block signup on attribution */
  }
  // Spent either way: the next person to sign up in this browser is their own.
  await clearJoin();
}

```

Attribution never blocks signup: the whole thing is inside a try/catch that
swallows failures.

### Where it surfaces

- A tinted card on the You tab ("Share the love"), opening `InviteSheet`.
- A dismissible banner, announced once, dismissal stored on the account
  (`invites_banner_at`) rather than localStorage so it clears across devices.
- The admin's People tab shows who invited whom.

### Can an unauthenticated visitor see a class or profile?

**Yes.** This matters for any share flow.

- `/{handle}` — a coach's or member's profile: public. A stranger gets
  `PublicTopBar` instead of the app header.
- `/{handle}/{classId}` — a class: public. `classDetail()` returns null only if
  the class is private, the owner blocked the viewer, or the id is wrong.
- `/s/{slug}` — a studio page: public.
- The Add ribbon and Follow require a session; a signed-out visitor sees the
  page but the header pill carries `?next=/{handle}` so signing in returns them
  where they were.
- `/feed`, `/week`, `/app`, `/you`, `/activity`, `/discover` all redirect out
  without a session.

---

## 9. Nav shell

Four tabs, five where Home is visible: **Home, Following, Search, Schedule,
You**. Home is dark-launched (admin only, or `HOME_ENABLED=true`).

`src/app/(tabs)/layout.tsx` (trimmed)
```tsx
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { avatarColor } from "@/lib/avatar";
import { homeVisible, landingHref } from "@/lib/flags";
import { invitesBannerCount } from "@/app/actions/invites";
import { feedbackHost, feedbackPromptDue } from "@/lib/feedback";
import { unreadNotifications } from "@/lib/notify";
import { getSessionUserId } from "@/lib/session";
import { AppHeader } from "@/components/AppHeader";
import { FeedbackPrompt } from "@/components/FeedbackPrompt";
import { InvitesBanner } from "@/components/InvitesBanner";
import { NavBar } from "@/components/NavBar";
import { lookMode } from "@/lib/darkmode";

export const dynamic = "force-dynamic";
// ... trimmed: the session lookup and the parallel loads (unread count,
// feedback prompt, invites banner, Home flag, landing href).
  return (
    <section className="screen hasnav" data-mode={lookMode(me.look)}>
      <div className="pad">
        <AppHeader
          unread={unread}
          home={landing}
          // Every screen in this group is the member side, so the magnifier
          // is always right here. No gear: the You tab is the door to the
          // account, and a second door in the corner said it twice.
          search
          // Activity has no tab; the heartbeat in the corner is its only door.
          activity
          nav={{ coach: isCoach, scheduleHref, home: showHome }}
        />
        {invitesLeft !== 0 && <InvitesBanner />}
        {children}
      </div>
      <NavBar coach={isCoach} face={face} scheduleHref={scheduleHref} home={showHome} />
      {askFeedback && <FeedbackPrompt hostName={askFeedback.name.trim() || "We"} />}
    </section>
  );
}

```

### How a new route slots in

Put it at `src/app/(tabs)/yourroute/page.tsx`. It inherits the header and tab
bar automatically, and `loading.tsx` in the group keeps the chrome up while it
loads.

**Put it in the group even if it is not a tab.** `/activity` is a page reached
only from the header's heartbeat icon, and it lives in `(tabs)` so the chrome
renders once around it. A route left outside the group rebuilds the header and
the bar on every navigation, which is the thing the layout exists to prevent.

To make it a real tab, add it to `navTabs()` in `src/lib/nav.ts` — one list that
both the bottom bar and the desktop header nav render.

### Two shells, not one

- `.screen.hasnav` — the tabbed member shell above. Body scrolls.
- `AppChrome` — used by screens outside the group (a profile, a studio page).
  It takes `bar` and `headerNav`; `headerNav` follows `bar` by default, because
  above 940px the bottom bar hides and the header links are the only navigation
  left. A screen with tabs at 390px and none at 1280px is a dead end.

The single opt-out is a profile (`headerNav={false}`), whose header floats over
a photograph where a row of ink links would be unreadable.

### Header

`AppHeader`: wordmark left, then search, the Activity heartbeat, the bell, and
(coaches-only mode) a gear. Above 940px it bleeds to both window edges and sits
its contents 64px in, with the tab links absolutely centred.

Icons fill in on their own screen via `HeaderIconLink`. The fill is CSS on the
first SVG path only, because the bell's clapper is an open stroke and filling it
paints shapes nobody drew.

---

## 10. Gaps

Things a designer should know before proposing work in these areas.

**Going visibility has no way off in the moment.** `attendances.is_public` and
`setGoingVisibility()` both exist and work, and the class sheet has a row for
it. But the note that answers an add no longer offers the choice, which reverses
an earlier decision that the moment of marking is where the choice lives. It is
a gap rather than a settled design.

**`attendances.companions` is a built column with no UI.** The schema supports
"with Joanne and Dave" as free-text names, deliberately not user references so a
friend without the app is still a person in the room. Nothing renders or writes
it.

**Push is admin-only.** See section 7. Any design assuming a member gets a phone
notification is designing something that does not exist yet.

**Profile views are recorded and read by nobody.** `page_visits` still fills up.
The You tab reorg removed the only surface that displayed a coach's own view
count, and it has not been replaced. A decision, not a patch.

**The class row is shared in three places and hand-rolled in three others.**
`Agenda.tsx`'s `ClassRow` is used by Following, a coach's public page, a
studio's page, and Discover. `ScheduleScreen.tsx` (twice) and `GymRota.tsx`
still emit their own `.ps-event` markup. Those three will drift from any change
made to the shared row.

**Home is dark-launched.** `/home` answers everyone else with Following. Its
Activity section is finished and also lives at `/activity`, which is *not*
gated. Events and clubs are in the Home spec and deliberately not built.

**Discover's search box is a door, not a field.** It navigates to `/search`. A
design that wants a per-tab placeholder ("Search coaches by name") would need to
turn it back into a real field, which was itself a deliberate reversal.

**Studios cannot be followed.** The Home spec asks for Follow on a verified
studio's row; it is not built, because the feed and digest pipelines are
handle-keyed and a gym has no handle. A Follow that bought nothing visible would
be a lie.

**`AgendaDay.label` is written everywhere and read nowhere.** Dead field.
Removing it touches eight files.

**No booking layer, on purpose.** No spots, availability, capacity, waitlists or
prices anywhere on a class. Booking links live on the class detail and hand off
to the studio's own system. This is a product line, not an oversight.

**Teams, charging and categories are named future work.** `PRICING.md` holds the
membership model. Nothing is built. Anything assuming a class belongs to exactly
one user, or that "follow" only points at a person, will need unpicking later.
