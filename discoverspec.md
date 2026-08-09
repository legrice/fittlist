# fittlist: Discover, populated

Spec for the Discover tab in its populated state, on the `discover-favorites`
branch. Two jobs: say in one place what the top rail does, and extend
favorites so a member can favorite another member, not only a coach.

Reference: the ClassPass day list is the shape the class list already
follows. This doc is about the people layer above it.

## Why

Discover's list answers "what can I go to". The rail above it answers a
different question: "who do I train with, and when are they on next". Today
the rail only holds coaches, which is half the room. The people you actually
go to class with are mostly other members, and the moment worth engineering
for is "Kia is going Thursday at 6, so I'll go too". Letting a member
favorite a member is what makes that moment reachable from the top of the
app's first screen.

## The page, top to bottom

1. **The top rail**: your favorites. Detailed below.
2. **Filters**: the category pills (built from the types the list actually
   holds, All leading), then Morning / Afternoon / Evening behind a hairline
   divider. Two axes: what the class is, and when in the day it runs.
3. **The date tabs**: Today, then "Mon 10" onward, pinned under the header.
   One day at a time; landing skips to the first day holding anything and
   says so in one line.
4. **The day's list**: flat rows. Time and length down the left, the class
   name loudest, the studio and the coach as caption lines. One row per
   class however many accounts list it. Every class lists itself; there is
   no studio fold. Tapping a row opens the class peek.

## What the top rail does

The rail is your favorites, and only your favorites. It is a row of faces
with a first name under each, and it exists to answer "who can I train with
next" without a single tap.

- **It never fills the feed.** The list below is everyone near you whether
  you favorited anybody or not. A favorite is a shortcut to a person, not a
  subscription. This is the whole difference between favorites and the old
  follow model, and it is why the feed is full on day one.
- **Soonest first.** The face in front is the person whose next class is
  nearest. A rail is read left to right and only the first few faces are
  seen without a swipe, so the order itself is the answer.
- **The caption is when.** Under each face: "Today 6:00p", the person's next
  class. A face with nothing coming up shows no caption and sorts to the
  back.
- **Tapping a face opens their peek.** A bottom sheet with that person's
  next fortnight, row by row, each row carrying Save. The star in the
  peek's head is the favorite itself: filled means favorited, tapping it
  un-favorites, and closing the sheet is when the rail catches up.
- **Add is the last item.** The plus at the end opens the finder. It is
  never one of the faces.
- **Empty, it teaches.** With no favorites the rail shows the plus, two
  dashed ghost circles, and one line: add the people you go to most, their
  next class always shows here. The shape of the thing sells the thing.
- **It is private.** Nobody sees whose faces you keep, there is no count
  anywhere, and the person you favorite is not notified with a running
  tally. A rail with a scoreboard is a rail people stop being honest on.

What the rail is not, learned the hard way and kept: it is not a filter
(tapping a face used to narrow the list; now it opens the person, because a
face is a door, not a checkbox), and it is not a suggestion engine (only
people you chose are on it).

## Members on the rail

A member can favorite a member. The star appears everywhere a member is
met: their profile, their peek, and the search results through their
profile. The mechanics are the follow mechanics that already exist
(`subscribers`, `follow_requests`); favorite is the word the product says.

**What a member's face opens.** The same peek a coach's face opens, loaded
with their week instead of a teaching schedule: the classes they marked
Going, dated and in time order, a fortnight ahead. Their rows are real
public classes, so every row carries Save, and that is the point: seeing
that Kia is at Thursday's 6pm and tapping Save is the whole feature.

**What it never shows.** Personal entries never reach the peek, the
caption, or anything else on Discover. There is deliberately no column that
could make one public, and this spec does not add one. A member's peek is
made of marks at real classes and nothing else.

**The gate is the one that already exists.** `canSeeWeek` answers: open by
default, gated when the person has approve-first on. Favoriting somebody
with approve-first on files a request and the star reads Requested; until
they approve, their peek says "Ask to see their week" in the same words
whatever the week holds, so the state cannot be read for whether there is
anything behind it. The caption under their face on the rail obeys the same
gate: a face must never leak the schedule its own peek would refuse to
show.

**The caption for a member** is their next visible marked class, same
format ("Thu 6:00p"). No caption when nothing is marked, when their week is
gated, or when everything marked has run.

**No kind badge.** A coach's face and a member's face look the same on the
rail, the way profiles carry no Coach or Member tag. The peek's contents
say which kind of week this is without a label.

## Where a member meets a member

The rail shows people already chosen; the choosing happens elsewhere, and
nothing about that changes here. You meet members on the "also going" line
of a class you both marked, on a coach's roster if you run one, in search,
and in rooms. Discover deliberately adds no "people you may know" rail: the
graph grows from shared rooms, not recommendations.

## Privacy lines this holds

- Favorites are private in both directions. No public list, no counts.
- One-way favorites surface nothing to the favorited person beyond the one
  notification a follow already sends.
- `personal_classes` never reach Discover in any form.
- Approve-first gates the peek and the caption alike.
- Blocked in either direction means not on the rail, not in the peek, not
  in the finder.

## Build notes

- `buildDiscoverFeed` currently drops `kind === "fan"` when building rail
  candidates. The rail becomes favorites of any kind; the class list's
  sources stay coaches and gyms, because members have no public classes to
  list.
- The member peek asks the same loader the member's profile schedule asks,
  behind the same `canSeeWeek`, so the peek and the profile can never
  disagree. This mirrors the coach peek asking `publicSchedules`.
- `CoachPeek` generalizes: same sheet, rows by kind. The star, the Save
  rows and the close behavior are already right.
- The rail's `next` caption for members computes from their visible marks,
  through the same gate as the peek, never around it.

## Not built with this, on purpose

- No member suggestions, no mutual-friend counts, no "X and 3 others".
- No activity feed inside Discover.
- No way to see who favorited you. The ethos line is the reason: a profile
  that can be lost at is worse than no profile.
