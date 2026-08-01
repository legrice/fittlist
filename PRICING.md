# How fittlist will charge

Not built. Written down so the shapes we build now leave room for it, and so
the reasoning survives the week it was thought through. Matt's plan, in his
words where it matters; the open questions at the bottom are mine.

Revisit at roughly 200 accounts. Before that the numbers aren't real enough to
price against.

## The shape

The Costco model: one simple membership, no upsell ladder, no paid placement.
You pay a small amount and that is the whole relationship.

**Members are free forever.** Following coaches, one merged week, marking
classes, your own plans. This never becomes a paid tier and never carries ads.

**A coach pays to keep a schedule.** Publishing your own week is the pro
feature: about $4 a month, or $24 for the year, which is half price for paying
up front. Everything a member gets stays free for them too.

**A studio pays more, in tiers.** The first tier is the page: a schedule, the
ability to edit your own entry, and the lock that stops anyone else editing it.
Ten to twenty dollars a month. Above that sit the rota features, the ones this
codebase already has: assigning coaches, swaps, shift counts.

**Eventually a studio can pay for its coaches.** A gym buys a membership that
covers everyone on its rota, so no coach at that gym is paying separately.

## Why charging is the honest option

Charging is what lets us promise the things the ethos already says. Told
plainly to the people paying:

- There will never be ads.
- Nobody is ever pushed to the top of Discover for money. Dribbble does this;
  we won't. Discover ranks by what is useful, never by what is paid for.
- This pays to keep the lights on, and that is the entire business model.

That is the "charge in the open" line in `ETHOS.md`, made specific.

## Growth: a free month per coach you bring

Every coach who signs up on your invite earns you a free month. It makes the
thing hyper-shareable and moves quickly without a single growth trick that the
ethos would refuse.

## Open questions, before any of this is built

These are the ones that decide whether it lands as fair or as a squeeze.

**What happens to a coach who stops paying?** Their page is a URL people have
written down and their followers have Going marks against it. Taking the
schedule down punishes the followers for a decision they had no part in. The
likely answer is that the page stays and the week freezes: it keeps serving
what is already there, and new classes need a live membership. It needs
deciding before anything is charged, because it is the whole trust question.

**The referral month can spoil.** Paying people to recruit is how a product
starts getting spammed by its own users, and counting who brought the most is a
scoreboard, which the ethos refuses. Two guards worth considering: credit the
month only once the coach they brought actually publishes a week, and never
show anyone else's referral count.

**Locking a studio page is not the same as claiming it.** Today the directory
is the commons until somebody claims it, and any coach can correct any entry,
because a row nobody owns is better kept right by the people who teach there.
Charging for the lock is fine. Charging for the correction is not: an unclaimed
studio has to stay as editable and as useful as it is now, or the paid tier
works by making the free one worse.

**A coach on a gym's plan still owns their own page.** If the gym stops paying,
or the coach leaves, their handle, their followers and their own classes go with
them. The gym is paying a bill, not renting the person.

**What a member can pay for, if anything.** Matt raised wanting to be messaged
directly for personal training. That reads like a coach feature rather than a
member one. Worth resisting anything that makes a member's experience better
for money: free forever should mean whole, not trimmed.
