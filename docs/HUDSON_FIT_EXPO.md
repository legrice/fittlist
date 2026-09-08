# Hudson Fit Expo registration

Planned event: **Saturday, September 12, 2026**. Default **20 places per class**, editable separately. Each class has an optional waitlist, off by default. No payment or ticketing integration is included.

## Setup on iPad

1. Sign into FittList in Safari as an admin of the Hudson Fit Expo space.
2. Build September 12’s dated classes in the space’s **Calendar**. Publish the classes people should be able to register for.
3. Open **Event registrations** from the space dashboard.
4. Preview September 12. Review each class and its capacity, enable waitlists for the classes that need them, then choose **Open registration for this date**.
5. Scan the displayed QR code on another phone and complete an actual email signup before using the sign at the expo.
6. For walk-ups, use **Send a walk-up signup link** to enter a name, email and class with the attendee’s permission. They verify on their own device; the iPad remains signed in as admin.
7. Keep the iPad on the registration desk. Attendees register on their own phones; their sessions never replace the organizer’s session.

The public link is `/s/<space-slug>/register`. It becomes useful after the date and capacities are saved. This work does not create or publish a real Hudson Fit Expo schedule; the actual space and classes must be selected by its admin.

## Attendee flow

QR → free class → name and email → terms/privacy acknowledgement → secure email link → explicit confirmation → server-checked place → sharing prompt / browse more classes.

The class/date/name intent travels in the server’s single-use email record, so a fresh browser opened from Mail retains it. Email previews do not consume the token. An inbox-verified new user receives a name and generated editable handle; photo, biography, password and following are deferred. Existing profiles and their visibility are preserved.

Only confirmed registrations occupy places. An email request does not reserve a seat. If the class fills before verification, the member joins its enabled waitlist; otherwise they see the full-class state. A transport failure can be retried without duplicating a registration. New event-path registrations are private in followers’ calendars by default; sharing is the attendee’s choice.

## Organizer tally

- Class registrations: one per member/class/date.
- Unique attendees: one person even when registered for multiple classes.
- Check-ins: class-specific, with an Undo control.
- Waitlist counts and signup-ordered names/emails, separate from confirmed attendance. When a place opens, contact the first person to check they can attend, then choose **Confirm place**. No automatic promotion email is sent. If someone declines, use **Remove** to let the next person receive the place. New signups cannot jump the queue. Waiting attendees can leave from their signup page. Disabling a waitlist stops new joins but preserves existing entries.
- CSV includes a Confirmed/Waitlisted status column.
- Per-class capacity, registered count and checked-in count.
- Name/email search, class filter, and CSV download.
- Refresh every 15 seconds while the desk is visible, plus manual refresh. Automatic refresh pauses while capacities are being edited.

Only the space’s admins can access attendee email addresses, exports, settings or check-in actions. Event email collection is for event administration, not marketing consent. CSV fields neutralize spreadsheet formula prefixes. Exports are private and non-cacheable. Cancellation deletes the active registration and its check-in; these are live operational tallies, not an immutable attendance ledger.

## Deployment and event-day checks

The additive database migration adds the event date, class capacity, optional check-in timestamp and email registration intent. Deploy the migration and app together through the normal build/deployment process. No Apple/iPad native release is needed: the organizer uses Safari.

Before the event:

- Confirm production email delivery and signup on a real phone, including Mail opening a fresh browser.
- Use two test attendees to compete for a final place; verify one succeeds, then cancel and refill it.
- Verify the printed QR points at the live space, the event date, times and timezone are correct, and all intended classes are public with limits saved.
- Check in, undo and export from the actual iPad in both orientations.
- Keep a network connection available. There is no offline registration queue or offline check-in mode.
- Add or verify the required event staff as space admins. Coach roster membership alone does not grant access to attendee emails.

## Automated checks

`npm run check:event-registration` exercises isolated database capacity races, ordinary-save bypass prevention, idempotency, cancellation, admin authorization, private rosters, unique counting, email continuation, minimal profiles, replay protection, CSV safety and studio closures.

After a production build, `npm run check:event-browser` runs WebKit phone and iPad portrait/landscape flows against synthetic accounts. `EVENT_BROWSER=chromium` runs the same browser checks in CI. No production records or real email deliveries are used.

## Verification in this implementation

Local production build, typecheck, lint, production regressions, data integrity and operations checks passed. The event-specific database checks passed, and WebKit exercised phone signup, opening the verification link in a fresh browser context, registration confirmation, the share sheet, private CSV access, QR delivery, and iPad portrait/landscape check-in/undo with accessibility checks. A missing-provider test confirms walk-up email failure leaves the organizer signed in and does not claim delivery.

Browser authentication tests use a loopback HTTPS proxy with a disposable self-signed certificate, because production Secure cookies should not be weakened to accommodate HTTP localhost. Synthetic email tokens substitute for actual inbox delivery. These checks do not certify a physical iPad, venue Wi-Fi, real delivery, or multi-connection PostgreSQL load. Capacity serialization uses a PostgreSQL row lock shared by all ordinary saves and event registrations; concurrency tests here run in embedded PostgreSQL.

Waitlist migration adds a separate queue with cascading user/class deletion. Waiting never counts as attendance or enables check-in. Promotions use the same class lock and capacity enforcement as registrations.
