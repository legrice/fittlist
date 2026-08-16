# Explore performance audit

## What was slowing the first screen down

Explore originally built Coaches, Classes, and Studios on every visit, even
though only one tab was visible. The hidden Classes view expanded schedules,
shifts, covers, gym-owned classes, attendance marks, and recurring dates before
the first useful screen could appear.

The prototype clarified that Explore is not a class catalog. Its three
destinations are People, Places, and Groups. Classes are found or created while
someone adds to their calendar, where the intent is already clear.

## Current request shape

| View | Data loaded |
| --- | --- |
| People | Public people, blocks, favorites/follow state, pending requests |
| Places | Places plus the small city vocabulary needed for legacy addresses |
| Groups | No directory query until group storage is implemented |

The default route no longer loads studios, schedules, attendance, shifts,
covers, recurrence expansion, or gym classes. Places loads only when selected.
Old `half=classes` links safely return to People, and old `half=studios` links
resolve to Places.

## Rendering work already in place

- Route-backed tabs fetch only the selected directory.
- The first four images are eager; later images use native lazy loading and
  asynchronous decoding.
- The route skeleton matches the above-the-fold grid so content does not jump.
- Search bars do not use shadows, and all spacing follows the shared 8px scale.

## Next measurements

Capture production server response time, query duration, response bytes, and
first rendered content separately for People and Places. If either directory
outgrows a fast first response, add cursor pagination at the database boundary
instead of sending the entire directory and hiding it client-side.
