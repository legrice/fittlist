# FittList: Discover updates

Addendum to `fittlist-discover-change-brief.md`. Where the two disagree, this wins. Reference prototype: `fittlist-end-to-end.html`.

---

## Supersedes the first brief

**Favoriting is gone. Everyone is a Follow.** The first brief replaced following with favoriting coaches. That's reversed. There is one relationship word, Follow, and it applies to coaches and members alike. No stars anywhere.

The distinction matters for why, not just what. The old follow was a subscription that fed your calendar with someone else's classes, and it fed nothing useful. The new follow is how you see someone's week, which is a thing they actually maintain. **Do not reconnect follow to calendar contents.** Following someone must never put a class on your calendar. It only lets you see theirs.

Vocabulary is now four terms, each with one job:

| Term | Means |
| --- | --- |
| Follow | A person whose week you can see |
| Save | A class you intend to go to. The ribbon |
| Coaching | A class you lead |
| RSVP | A save the organizer can see. Only on RSVP-enabled classes |

---

## The rail: This week

Sits under the search field, above the filters. Contents, left to right:

1. **Your week.** Dashed circle. Goes to the Share tab. No status text under it.
2. **People you follow**, coaches and members mixed, no visual distinction between them. Unseen first.
3. **Add.** Goes to People near you.

Rules:

- No timestamps, no next-class times, no coach badges under any circle. The circle is a name and a ring.
- **The ring is the freshness signal.** Solid orange when that person's week has changed since you last opened it, grey once you've seen it. Anyone whose week hasn't been touched in seven days drops off the rail entirely.
- Hide the rail below about three people with fresh weeks. An empty story rail reads as a dead app, and at current density most accounts will have one.

## The peek

Tapping any circle opens their week as a **live calendar, not an image**. Same rows as anywhere else in the app, with ribbons that work.

Contents:

- Header: name, "Week of <date>", Follow / Following.
- Their week is everything they coach plus everything they saved, in time order.
- Classes they coach carry a **Coaching** tag. Everything else is something they're going to. This is the only place in the app where coach and member differ.
- Anything you've also saved is marked **You saved this too**, and the sheet opens with a line like "You have 2 of these on your week."
- Footer line: ribbon anything here to put it on your own week.

The overlap marker is the point of the whole feature. It's how "you're going to that, I'm going to that" happens, and it works without anyone declaring anything beyond a save.

---

## Discover filters

Four dropdown chips in one row, replacing the old category pills. Each opens a sheet.

| Chip | Options |
| --- | --- |
| Time | Any, morning before 11, midday 11 to 4, evening after 4 |
| Distance | Any, within 1, 3, 5 miles |
| Type | Any, plus the class categories |
| Places | Multi-select from places that have classes |

Details that matter:

- **Chips display their current value**, not a generic label. "Within 1 mile," not "Distance." That's what lets one row replace five pills and say more.
- Active chips invert. A dashed **Clear** appears when anything is set.
- **The places sheet stays open while you tick**, since multi-select through a closing sheet is miserable.
- **The empty state knows why it's empty.** If filters are active, say "Nothing matches, try widening the time or distance" with a clear button. Never show "nobody has added classes here" when the truth is the filter.

## Upcoming, not this week

The list is open-ended and titled **Upcoming near you**. It runs forward as far as there's data rather than being bounded to seven days, because coverage is thin and an expo three weeks out is exactly what someone wants to find.

**This only works with series collapse.** A recurring class appears once, at its next occurrence, marked `Weekly` on the place line. Without that, an open list is the same class repeating down the feed forever and the feed is worthless.

Known tradeoff: someone hunting for a specific weekday has to open the class to see the full pattern. Acceptable for browsing. Revisit if the time filter turns out to be heavily used.

## People near you

Reached from the rail's Add. This is where coaches and members are distinguished, because here it's useful.

- Segment at top: **Everyone / Coaches only**.
- Coach rows carry a small **Coach** tag and their next class time. Member rows carry neither.
- Follow button on every row, unlimited.

---

## Open, and worth deciding before building

**Is publishing your week explicit or implicit?** The rail assumes people have a week worth showing, but nothing in the flow says "publish." Two options: your week is visible to followers automatically, subject to a privacy setting, or it appears only when you tap Share. Implicit is the one I'd pick, because explicit publishing means most rails stay empty and the feature dies before it starts. But it changes what people expect when they save something, so decide deliberately.

**What happens to a save when you unfollow someone.** It stays yours, presumably. Confirm.

**Whether the ring should reset on any change or only on new classes.** Editing a time shouldn't necessarily re-alert everyone.

**Instrumentation.** The number that matters is outbound booking-link taps per class, segmented by whether the person has any social connection to the existing user base. Add it now while the volume is small enough to sanity-check by hand.
