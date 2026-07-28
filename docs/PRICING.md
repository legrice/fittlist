# Free vs Pro — a starting position

Written to be argued with. Nothing here is built yet; the point is to agree the
line before it's expensive to move.

## The one rule

**Members never pay, and never see a worse product because their coach didn't.**

Members are the network. A coach's page is worth having because people follow
it; people follow it because following is free and the week is complete. Any
gate that makes a member see less — a truncated schedule, a missing class, a
digest that stops arriving — costs more in network value than it could ever
collect in subscriptions.

That rules out the obvious-looking gates. "Free coaches show 5 classes" punishes
the follower for the coach's decision. So does "free coaches can have 50
followers." Both make the product worse at the exact moment it's working.

So: **Pro is a coach subscription, and it gates what the coach gets, never what
their followers get.**

## What stays free, permanently

These are the product. Gating any of them breaks the loop that makes FittList
worth using at all.

| | Why it can never be Pro |
|---|---|
| The public page at `fittlist.co/{handle}` | It's the growth loop. Every page is an ad. |
| Unlimited classes, recurring + one-off + end dates | The schedule *is* the product. |
| Unlimited followers, and following anyone | Members are the network; capping it caps us. |
| The weekly digest to followers | The reason a follow is worth anything. |
| QR code, share link, `.ics` feed | Distribution. We want these everywhere. |
| Being listed in Discover | A thin directory helps nobody. |
| Receiving private-session requests | A member must always be able to reach a coach. |
| The three headline stats | Enough to feel the thing working. |

## What Pro should be

Ranked by how confident I am, most confident first.

### 1. Remove "Made with fittlist" from your page — high confidence

The oldest, cleanest gate on the internet, and it prices exactly the thing a
professional cares about: looking independent. Cost to us is zero, and the free
tier keeps carrying the loop.

### 2. Your own domain — high confidence

`train.carinaclores.com` instead of `fittlist.co/carina`. Coaches who've built a
brand want this badly, and coaches who haven't won't miss it. Self-selecting,
and it's real work on our side (DNS, certs), so it's honest to charge for.

### 3. Telling followers something now — high confidence

The weekly digest stays free forever. **Sending anything else** is Pro:

- "Tonight's 6pm is cancelled"
- "New 6-week block starts Monday"
- Push/instant notification when the schedule changes

This is the feature coaches will ask for first, it has real cost per send, and
it's where "I have an audience" turns into "I can use my audience." Note it also
needs abuse limits — which is another argument for it being a paid, accountable
tier.

### 4. Analytics with a memory — good confidence

Free shows *now*: views, followers, requests. Pro shows *change*:

- Views over time, week by week
- Which classes get opened, and which convert to Going
- Where traffic came from — QR, direct link, Discover, a coach who shared them

Free tells you it's working. Pro tells you what to do about it. That's a real
line, not a fake one.

### 5. Brand on the share image — good confidence

The story image is already the most-shared artifact. Pro gets: a background
photo, custom colours beyond the palette, a logo. Free keeps the current themes,
which are good enough to want to post.

### 6. Google Calendar sync — medium confidence

Already built, genuinely costly to run and support. Reasonable to charge for.
The counter-argument: it's a retention feature, and a coach whose classes sync
automatically never churns. Might be worth keeping free precisely because it
makes leaving painful.

### 7. Your people, as a list — medium confidence

Export followers and subscribers as CSV; a simple client list with notes. Real
value to a coach running a business, no value to a hobbyist, invisible to
members. The catch: be very careful about what "export your followers" means
for the people on that list. Emails they gave to follow a coach are not a
mailing list the coach owns outright — this needs a consent story before it
ships, not after.

## What I'd leave alone

**Don't sell placement in Discover.** The moment ranking is purchasable, the
directory stops being useful to members, and the directory's usefulness is what
makes being listed worth anything. If Pro needs something here, make it a
richer card (photo, types, next class) rather than a better position.

**Don't gate the inquiry inbox.** A member trying to book a private session is
the highest-intent moment in the product. Charging to receive that is charging
at the worst possible place. Charge for *tools around it* — saved replies,
custom intake questions, deposits — not the message itself.

**Don't gate the number of studios.** Coaches who teach at five gyms are exactly
the ones the product is for.

## Price

Solo fitness coaches are price-sensitive and mostly not rich. I'd start at
**$9/month or $79/year** — cheap enough to be an easy yes after one client, and
the annual saves you the monthly churn conversation. A "first month free" beats
a free trial that needs a card.

Resist bundling everything into one tier at $29 because the unit economics look
nicer. At this stage the goal is to learn which single feature people will pay
for, and a fat tier tells you nothing.

## The tier after this one

Studios. A gym paying for every coach on its roster is a much bigger number than
a coach paying for themselves — but as noted elsewhere, studios bring
verification, coach rosters, and "what happens when someone gets fired" with
them. That's a product problem before it's a pricing one. Park it.

## When to actually do this

**Not yet.** With a handful of beta coaches, a paywall buys a few hundred
dollars and costs you the momentum and the feedback. Ship Pro when:

1. Coaches are asking for one of the features above unprompted, and
2. There are enough coaches that "some of them convert" is a real sentence.

## What to build now, though

One seam, so this isn't a refactor later:

- `users.plan` — `"free" | "pro"`, defaulting to free.
- `isPro(userId)` in `src/lib/plan.ts`, used **in the server action**, not just
  to hide a button. Every gate has to hold when someone calls the action
  directly.
- A single `<ProGate>` component for the upsell, so all of them look and read
  the same.
- Stripe when there's something to charge for — not before.

Adding the column and the helper now costs an hour. Retrofitting a plan check
into thirty call sites later costs a week.
