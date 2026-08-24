import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  doublePrecision,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export type BookingLink = { label: string; url: string };

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
  // The same picture at list size, written alongside it by the pickers: a
  // 26px circle should not download the hero's file. Null on rows saved
  // before this existed; readers fall back to photo.
  photoThumb: text("photo_thumb"),
  // A short role/tagline shown under the name (e.g. "Strength coach").
  title: text("title"),
  // City / area shown under the name on the public profile (e.g. "Jersey City").
  location: text("location"),
  // The location as real coordinates, written when it was picked from the
  // geocoder (or backfilled by the server's own lookup of the typed text).
  // What "near you" is computed from; null on rows saved before this.
  locationLat: doublePrecision("location_lat"),
  locationLng: doublePrecision("location_lng"),
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
  // and overwritten at claim time with "footer:{handle}" when the signup came
  // through a coach's public-page footer, which is the more specific fact.
  // First-party and admin-only; null reads as "direct".
  signupSource: text("signup_source"),
  // Visual style for this trainer's app + public page: "classic" | "blocks" | "poster".
  theme: text("theme").notNull().default("poster"),
  // Page look: how the coach's app AND public page render. Null = the default
  // light look; "dark" today, more colour looks later.
  look: text("look"),
  // Set when this account unsubscribes from the merged weekly digest. Separate
  // from unfollowing on purpose: "stop emailing me" must not empty their feed.
  digestOptOutAt: timestamp("digest_opt_out_at", { withTimezone: true }),
  // Email preferences, settable in Settings > Notifications. These gate the
  // email copy only: the in-app notification always lands, and someone with
  // no account (a visitor who wrote in) is always emailed, because it's the
  // only door they have.
  emailMessages: boolean("email_messages").notNull().default(true),
  emailCancellations: boolean("email_cancellations").notNull().default(true),
  // The private-account gate: on means a follow starts as a request they
  // approve. Off (the default) keeps follows one-tap. Pairs with
  // discoverable: listed and gated is a fine combination.
  approveFollowers: boolean("approve_followers").notNull().default(false),
  // Listed in the Find coaches directory. Their page stays public either way —
  // this is only about being browsable by people who weren't sent the link.
  discoverable: boolean("discoverable").notNull().default(true),
  // Whether the Message button appears on their public page. Separate from
  // availability, which says whether they're taking private clients: "my books
  // are full" and "don't write to me" are different sentences, and a coach who
  // is full still wants to hear from the person asking about a class.
  messagesOpen: boolean("messages_open").notNull().default(true),
  // Whether the shifts a gym has them on show on their own public page, share
  // and calendar feed, alongside the classes they own. Off by default, because
  // a shift is work rather than a listing and a coach may want no public trace
  // of it at all; on, it is how somebody who teaches at four gyms has one page
  // that answers "how do I train with you". Their answer only, and separate
  // from whether the *gym's* schedule ever names them, which is the gym's.
  shiftsPublic: boolean("shifts_public").notNull().default(false),
  // What this person teaches, from the same curated list a studio picks from
  // (STUDIO_TYPES). One vocabulary, so a single filter in Discover finds the
  // yoga teachers and the studios that offer yoga. Free text would be a
  // hundred spellings of the same word and a filter nobody could use.
  disciplines: jsonb("disciplines").$type<string[]>().notNull().default([]),
  // Their pick from AVATAR_COLORS, behind the initial when there's no photo.
  // Null means "derive one from my id" — everyone looks distinct from day one.
  avatarColor: text("avatar_color"),
  // Extra labelled links on the public page (booking sites, programs, a second
  // gig) beyond the single website field. Capped in the action, not here.
  profileLinks: jsonb("profile_links")
    .$type<{ label: string; url: string }[]>()
    .notNull()
    .default([]),
  // Share-image customisation: headline, photo chip, preferred theme. A blob so
  // later knobs (background image, formats) slot in without schema churn.
  storyPrefs: jsonb("story_prefs")
    .$type<{ headline?: string; showPhoto?: boolean; theme?: string; background?: string }>()
    .notNull()
    .default({}),
  // Set when the coach finishes (or skips) the post-signup setup wizard. Null =
  // they still need to run it; the app redirects them into /welcome until it's set.
  onboardedAt: timestamp("onboarded_at", { withTimezone: true }),
  // When we last put the "how's it going?" prompt in front of them. Set the
  // moment it's shown, not when it's answered: a prompt they scrolled past is
  // still a prompt they've seen, and asking again next page load is nagging.
  feedbackPromptedAt: timestamp("feedback_prompted_at", { withTimezone: true }),
  // When they closed the "you have invites" banner. On the account rather than
  // in localStorage so dismissing it on a phone also dismisses it on a laptop:
  // a banner you have to swat once per device is a banner nobody thanks you for.
  invitesBannerAt: timestamp("invites_banner_at", { withTimezone: true }),
  // Their share link: fittlist.co/j/{code}. Opening it is what lets whoever
  // followed it past the beta gate, and it's how we know who brought them.
  // Minted the first time they ask for it, then permanent, so a link that's
  // out in the world never stops working.
  inviteCode: text("invite_code").unique(),
  // When they last changed their handle. Null = never (the claim at signup
  // doesn't count). One change per 90 days: a handle is an address people
  // write down, and an address that keeps moving breaks every link out there.
  handleChangedAt: timestamp("handle_changed_at", { withTimezone: true }),
  // When the admin last opened the Activity list. Only meaningful on admin
  // accounts; everything newer than this counts toward the header badge.
  adminActivityAt: timestamp("admin_activity_at", { withTimezone: true }),
  // Refreshed every time a session is issued (any login method). Powers the
  // admin "last seen" column.
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  // A short pinned status shown at the top of the public page (e.g. "Away this
  // week", "Subbing the 6pm today"). Null = no active announcement.
  announcement: text("announcement"),
  announcementAt: timestamp("announcement_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Invite-only beta: an email must be invited before it can create an account.
// Existing accounts are never checked (only the new-user branch consults this).
export const invites = pgTable("invites", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(), // normalized lowercase
  label: text("label"), // optional note: name, gym, how you know them
  invitedByUserId: uuid("invited_by_user_id").references(() => users.id),
  acceptedUserId: uuid("accepted_user_id").references(() => users.id),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Members asking to coach. Becoming a coach used to be a self-serve switch,
// which is also how member-recreated classes got into the directory: anyone
// could flip the flag and publish. Now the flag is the admin's to flip
// (adminSetKind), and this is the queue in front of it. handledAt covers both
// outcomes; approval is visible in users.kind, not here.
export const coachRequests = pgTable("coach_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  note: text("note").notNull().default(""),
  handledAt: timestamp("handled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Coaches who hit the invite-only wall and asked to be let in. The admin sees
// these and can invite them with one tap.
export const inviteRequests = pgTable("invite_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().default(""),
  email: text("email").notNull().unique(), // normalized lowercase
  handledAt: timestamp("handled_at", { withTimezone: true }), // invited or dismissed
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Private-training inquiries. A visitor's "Request private session" opens a
// thread with the coach; both sides can keep replying (the coach in-app, the
// visitor via a tokenized link). One thread per coach + requester email.
export const inquiryThreads = pgTable(
  "inquiry_threads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    coachUserId: uuid("coach_user_id").notNull().references(() => users.id),
    // "inquiry" (a visitor asking a coach about private sessions) or "feedback"
    // (someone writing to us about the app). Same machinery, different room:
    // the admin is also a coach, so without this their feedback and their real
    // private-session requests would land in one thread.
    kind: text("kind").notNull().default("inquiry"),
    requesterName: text("requester_name").notNull().default(""),
    requesterEmail: text("requester_email").notNull(), // normalized lowercase
    // Optional, and it stays optional: a phone field that blocks the send turns
    // an inquiry into a form. Kept on the thread so the coach can call back
    // without digging through the messages for a number.
    requesterPhone: text("requester_phone"),
    coachUnread: integer("coach_unread").notNull().default(0),
    // Unread count on the other side of the table. Only means anything when
    // the requester email belongs to an account; a visitor reads over email.
    requesterUnread: integer("requester_unread").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("inquiry_thread_coach_email").on(t.coachUserId, t.requesterEmail, t.kind),
    index("inquiry_thread_requester_kind").on(t.requesterEmail, t.kind),
  ],
);

export const inquiryMessages = pgTable("inquiry_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  threadId: uuid("thread_id").notNull().references(() => inquiryThreads.id),
  fromCoach: boolean("from_coach").notNull().default(false), // false = the visitor
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Studios a coach says they work at, chosen in the setup wizard. Independent of
// the classes they publish, so "Where I coach" can be populated before any class
// exists. Public "Where I coach" is the union of these and class-derived studios.
export const coachStudios = pgTable(
  "coach_studios",
  {
    userId: uuid("user_id").notNull().references(() => users.id),
    studioId: uuid("studio_id").notNull().references(() => studios.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("coach_studios_user_studio").on(t.userId, t.studioId),
    index("coach_studios_studio").on(t.studioId),
  ],
);

// Global/shared directory. `seq` gives the deterministic directory index that
// drives the studio color cycle (Sky, Tacha, Sand, Olive).
export type StandardWeekSlot = {
  name: string;
  classType: string | null;
  description: string | null;
  image: string | null;
  startTime: string;
  durationMin: number;
  links: BookingLink[];
  plannerColor: string | null;
  isPublic: boolean;
};
export type StandardWeek = Partial<Record<"0" | "1" | "2" | "3" | "4" | "5" | "6", StandardWeekSlot[]>>;

export const studios = pgTable("studios", {
  id: uuid("id").primaryKey().defaultRandom(),
  seq: serial("seq").notNull().unique(),
  // URL for the studio's own page. Derived from the name, unique across the
  // directory; the id is the fallback for anything created before slugs.
  slug: text("slug").unique(),
  name: text("name").notNull(),
  address: text("address").notNull(),
  // "Studio" was the first kind of place in the directory, not the whole
  // category. Existing rows default to it; events, parks and virtual rooms
  // use the same page, schedule and class attachment without pretending to
  // be brick and mortar.
  placeKind: text("place_kind").notNull().default("studio"),
  // The address, geocoded once at save: a studio is a place, and a place
  // has coordinates. Best-effort; null when the lookup missed.
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  // What kind of gym it is — a studio is usually more than one thing.
  types: jsonb("types").$type<string[]>().notNull().default([]),
  photo: text("photo"),
  about: text("about"),
  contactEmail: text("contact_email"),
  phone: text("phone"),
  website: text("website"),
  instagram: text("instagram"),
  createdByUserId: uuid("created_by_user_id").references(() => users.id),
  // One accountable owner holds the master key. They may add/remove managers
  // or hand ownership to another manager; managers run the studio without
  // being able to quietly replace the owner.
  ownerUserId: uuid("owner_user_id").references(() => users.id),
  // The gym's own account, once it runs its schedule here. A users row with
  // kind "gym": no handle, no password, nobody signs into it. It exists so the
  // gym's classes have an owner that isn't a person, which is the whole reason
  // Tom can teach without a public profile and Josh can publish a schedule
  // without naming anyone. Its managers act for it; see studio_managers.
  accountUserId: uuid("account_user_id").references(() => users.id),
  // Whether a coach handing a shift on or picking one up needs a manager to
  // say yes. On by default, per the staff spec. Off restores what the rota
  // did before this existed: the change lands the moment it is made and
  // everybody who should know is told, which some studios will prefer.
  approveShiftChanges: boolean("approve_shift_changes").notNull().default(true),
  // Whether the studio's public schedule names who is coaching each class.
  // On by default for a verified studio (only a claimed studio has a rota to
  // name anyone from), off for the gyms that would rather publish a week
  // without making it a roster. The switch lives on the shifts screen's
  // overflow, with the studio's other settings.
  showCoaches: boolean("show_coaches").notNull().default(true),
  // A reusable Monday-through-Sunday class template. Staffing deliberately
  // does not live here: changing the standard week changes what runs, never
  // who is coaching the dated rota.
  standardWeek: jsonb("standard_week").$type<StandardWeek>().notNull().default({}),
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

// A studio-wide closure is a reversible date on the operating calendar, not
// the deletion of every class that happened to land there. `classIds` is the
// exact set of occurrences that were running when the manager closed the day;
// reopening removes only the skip written for those rows, so a class that had
// already been cancelled on its own stays cancelled.
export const studioClosedDays = pgTable(
  "studio_closed_days",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studioId: uuid("studio_id").notNull().references(() => studios.id),
    occurrenceDate: date("occurrence_date").notNull(),
    classIds: jsonb("class_ids").$type<string[]>().notNull().default([]),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("studio_closed_days_once").on(t.studioId, t.occurrenceDate),
    index("studio_closed_days_date").on(t.occurrenceDate),
  ],
);

// A shift change waiting on a manager.
//
// The rota's own tables say what is true: `classes.coachUserId` is who
// normally teaches a slot and `shift_covers` is one date's exception. Neither
// can hold "somebody would like this to be true", which is what an approval
// queue is, so a pending change lives here and only becomes a cover once it
// is approved. That keeps the calendars honest: nothing a manager has not
// answered ever reaches a public page, a feed, or anybody's .ics.
//
// It is keyed on the class and the date rather than on a cover row, for the
// same reason a report is keyed on the series: the cover may not exist yet
// (a pickup of a never-assigned slot) and may be deleted underneath it.
export const shiftRequests = pgTable(
  "shift_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studioId: uuid("studio_id").notNull().references(() => studios.id),
    classId: uuid("class_id").notNull().references(() => classes.id),
    occurrenceDate: date("occurrence_date").notNull(),
    /** "pickup" (an open shift somebody wants) or "transfer" (a named
     *  hand-over). The two read differently to a manager and are the same
     *  write once approved. */
    kind: text("kind").notNull(),
    /** "occurrence" moves only occurrenceDate; "standing" changes the
     *  regular weekly coach from that date forward. */
    scope: text("scope").notNull().default("occurrence"),
    /** Who the shift is coming from. Null on a pickup of a slot nobody held. */
    fromUserId: uuid("from_user_id").references(() => users.id),
    /** Who it would land on. Never null: a request with nobody on the end of
     *  it is a release, and a release is immediate. */
    toUserId: uuid("to_user_id").notNull().references(() => users.id),
    /** pending | approved | declined. Answered rows are kept, because the
     *  Requests tab becomes a log when a studio turns approval off and a
     *  declined ask is a thing the coach should still be able to see. */
    state: text("state").notNull().default("pending"),
    decidedByUserId: uuid("decided_by_user_id").references(() => users.id),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // One live ask per person per slot. Two coaches may both want the same
    // open shift, which is a real race a manager settles, so the index
    // carries the taker.
    uniqueIndex("shift_requests_live").on(t.classId, t.occurrenceDate, t.toUserId, t.state),
    index("shift_requests_studio_state").on(t.studioId, t.state),
  ],
);

// Who a shift can be handed to. Anyone may say they coach at a gym (the
// directory runs on trust), but not everyone listed there teaches the group
// classes on the rota, so the managers name the pool: a coach handing a date
// on picks from these people and nobody else. Its own table rather than a
// flag on coach_studios because that row is the coach's own claim about
// themselves, and this is the gym's claim about the coach.
//
// A roster entry is a position, not an account. This is the rule the rest of
// the staff side follows from: a studio building next week cannot wait for
// every coach to sign up, so an entry has to be able to exist, and hold
// shifts, before any real person is attached to it.
//
// The row still points at a `users` id, and deliberately so. A placeholder
// gets a real users row with `kind = "placeholder"`, the same trick the gym
// account already uses (`studios.accountUserId`): a synthetic .invalid email
// nobody can receive or sign up with, no handle, not discoverable. The value
// of that is everything downstream keeps working untouched, because
// `classes.coachUserId`, `shift_covers.coachUserId`, the counts, the private
// feed and the notifications all just see a user. The alternative, a nullable
// userId plus a name on this row, would mean every one of those learning that
// a shift might be held by something that isn't a user.
//
// `state` is what the roster screen groups by:
//   active       on fittlist, accepted, linked
//   invited      on fittlist, asked, hasn't answered
//   placeholder  not on fittlist; a name and an invite
//   unconfirmed  turned up by claiming or asked to join
//
// `onSchedule` is the second, independent question: the association remains
// visible to the studio when it is off, but only assignable states with it on
// can hold or trade shifts. `unconfirmed` can never be made assignable.
export const studioRotaCoaches = pgTable(
  "studio_rota_coaches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studioId: uuid("studio_id").notNull().references(() => studios.id),
    userId: uuid("user_id").notNull().references(() => users.id),
    /** active | invited | placeholder | unconfirmed. */
    state: text("state").notNull().default("active"),
    /** coach | front_desk. Permission roles such as owner and manager remain
     * in studio_managers; this is the person's working role on the team. */
    role: text("role").notNull().default("coach"),
    /** The studio keeps the association even when this is off, but the coach
     *  cannot be assigned, receive coverage requests, or use the staff-side
     *  rota until a manager puts them back on the schedule. */
    onSchedule: boolean("on_schedule").notNull().default(true),
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("studio_rota_coaches_once").on(t.studioId, t.userId),
    // An invite email represents one position at this studio. This closes the
    // last concurrency gap where two managers could create two placeholders
    // for the same person before either request observed the other.
    uniqueIndex("studio_rota_invited_email_once")
      .on(t.studioId, t.invitedEmail)
      .where(sql`${t.invitedEmail} is not null`),
  ],
);

// Who runs a studio's page. A studio with no rows here is unclaimed, which is
// the directory's normal state: anyone coaching can correct it, because an
// entry nobody owns is better maintained by the people who teach there than
// left wrong. One row and the studio is claimed, and from then on only these
// people (and the site admin) may edit it; everyone else suggests.
//
// A join table rather than a column on studios, because a gym is a place of
// work with more than one person running it: an owner and a manager both need
// the keys, and either leaving must not lock the other out.
export const studioManagers = pgTable(
  "studio_managers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studioId: uuid("studio_id").notNull().references(() => studios.id),
    userId: uuid("user_id").notNull().references(() => users.id),
    // Who let them in. De-attributed rather than deleted when that account
    // goes, the same as a studio edit: it stays a fact about the studio.
    addedByUserId: uuid("added_by_user_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("studio_managers_once").on(t.studioId, t.userId),
    index("studio_managers_user").on(t.userId),
  ],
);

// The directory runs on trust: any coach can correct any studio. This is the
// receipt. One row per save that actually changed something, with the editor
// and a plain-words line per field, surfaced on the admin Studios tab.
// De-attributed (not deleted) in adminDeleteUser: the edit stays a fact about
// the studio after its author leaves.
export const studioEdits = pgTable("studio_edits", {
  id: uuid("id").primaryKey().defaultRandom(),
  studioId: uuid("studio_id").notNull().references(() => studios.id),
  editorUserId: uuid("editor_user_id").references(() => users.id),
  changes: jsonb("changes").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// A community happening that isn't anyone's class: an expo, a competition, a
// meetup in a park. Its own object, because faking one as a class would put
// it on somebody's schedule. Coaches post them (kind-gated in the action) and
// every event carries its poster; there is deliberately no ticketing and no
// RSVP here, the link points out to wherever that lives. De-attributed, not
// deleted, in adminDeleteUser: the expo is still happening after its poster
// leaves.
export const events = pgTable("events", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  startDate: date("start_date").notNull(),
  // Multi-day happenings (an expo weekend). Same as start_date for one-dayers.
  endDate: date("end_date").notNull(),
  startTime: text("start_time"), // "HH:MM" 24h, null = all-day
  place: text("place").notNull(),
  city: text("city"),
  photo: text("photo"),
  description: text("description"),
  link: text("link"),
  // Who's putting it on, free text: the poster often isn't the host.
  hostName: text("host_name"),
  createdByUserId: uuid("created_by_user_id").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Going, for the events board: same meaning as a class mark, anchored to the
// happening instead of an occurrence date. Unique per person per event;
// deleted with the event and with the person.
export const eventAttendances = pgTable(
  "event_attendances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id").notNull().references(() => events.id),
    userId: uuid("user_id").notNull().references(() => users.id),
    // Same as a class mark's companions: names in the room, not accounts.
    companions: jsonb("companions").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("event_attendances_event_user").on(t.eventId, t.userId)],
);

// A device that asked to be pinged. Admin-only for now (the one use is "tell
// me when someone joins"), but the shape is general: one row per browser
// subscription, owned by a user, deleted with them in adminDeleteUser. The
// endpoint is the subscription's identity; a dead one is pruned on send.
export const pushSubscriptions = pgTable("push_subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const classTemplates = pgTable(
  "class_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id),
    name: text("name").notNull(),
    // Category from the curated CLASS_TYPES list (e.g. "Strength", "Yoga").
    classType: text("class_type"),
    // Short blurb shown on the public class page.
    description: text("description"),
    // The picture comes back with the class name, same as the description.
    image: text("image"),
    startTime: text("start_time").notNull(), // "HH:MM" 24h
    durationMin: integer("duration_min").notNull(),
    // Null for private items with no listed studio; `location` holds a free-form
    // place ("Client's home", "Online") in that case.
    studioId: uuid("studio_id").references(() => studios.id),
    location: text("location"),
    // Who it's with, for one of your own: "Kia". A name, not an account, the
    // same as on the entry itself. It lives here so the second "Training with
    // Kia" comes back filled in rather than retyped, which is the whole point
    // of a template.
    withWho: text("with_who"),
    // false = a private client/session: on the coach's own schedule only, never
    // on their public page, and no subscriber emails.
    isPublic: boolean("is_public").notNull().default(true),
    links: jsonb("links").$type<BookingLink[]>().notNull().default([]),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("class_templates_user_name").on(t.userId, t.name)],
);

// Shared, cross-coach catalog of what classes run at each studio. Every publish
// upserts here (deduped by studio + normalized name), so the data accumulates
// toward a future studio / member-facing view. Not surfaced in the coach UI yet.
export const studioClasses = pgTable(
  "studio_classes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studioId: uuid("studio_id").notNull().references(() => studios.id),
    name: text("name").notNull(),
    nameKey: text("name_key").notNull(), // lowercased name, for dedupe
    classType: text("class_type"),
    description: text("description"),
    // Shared with the description: a picture belongs to the class rather than
    // to whichever coach wrote it down first.
    image: text("image"),
    // A class keeps one visual identity everywhere the studio schedules it.
    // The token is private to the management planner and never changes how
    // the class appears on member or coach calendars.
    studioPlannerColor: text("studio_planner_color"),
    /** How long it runs, so pulling a class in fills the length too. A gym
     *  filling a week types the same 60 over and over otherwise, and the
     *  number is a fact about the class rather than about one slot. Nullable
     *  because every row written before this column existed has none. */
    durationMin: integer("duration_min"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("studio_classes_studio_name").on(t.studioId, t.nameKey)],
);

// Coach-added class categories on top of the curated CLASS_TYPES list. Shared,
// so once someone adds "Spin" it shows in everyone's Type dropdown.
export const customClassTypes = pgTable(
  "custom_class_types",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    nameKey: text("name_key").notNull(),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("custom_class_types_name").on(t.nameKey)],
);

// The standing week. day_of_week: 0 = Monday … 6 = Sunday (prototype order).
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
    // Denormalized from studio_classes so the planner can render a whole month
    // without joining the catalog for every occurrence. The catalog is the
    // source of truth; manager writes keep every slot of that class in sync.
    studioPlannerColor: text("studio_planner_color"),
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
    name: text("name").notNull(),
    classType: text("class_type"),
    description: text("description"),
    studioId: uuid("studio_id").references(() => studios.id),
    location: text("location"),
    // A picture of the class, as a small data URL, the same way every other
    // photo here is stored. It is the thing that makes a shared class look
    // like something rather than a line of text, and it is optional forever:
    // a schedule with no photos has to stay a good schedule.
    image: text("image"),
    // false = private (own schedule only, hidden from the public page).
    isPublic: boolean("is_public").notNull().default(true),
    // RSVP, per the Discover brief: a save the organizer can see. The
    // mechanism stays attendances; this flag only changes the words (the
    // ribbon becomes an RSVP button, the count reads "3 RSVP'd") and makes
    // the roster's names the point rather than an owner-only aside. No
    // capacity, no waitlist, no check-in: capacity is the line that turns
    // RSVP into a booking system, and it was cut on purpose.
    rsvp: boolean("rsvp").notNull().default(false),
    links: jsonb("links").$type<BookingLink[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("classes_user").on(t.userId),
    index("classes_coach").on(t.coachUserId),
    index("classes_studio").on(t.studioId),
  ],
);

// Someone a coach doesn't want on their page. Quiet on purpose: nothing tells
// the blocked person, because a notice is an invitation to make a new account
// and a fight. From their side the coach's page simply stops existing, which is
// what a deleted account looks like too, so it isn't a signal.
// A member's own standing class: the Tuesday spin they actually go to, at a
// gym whose coach isn't on fittlist yet. Private by construction, and there is
// no column that could make one public: it lives in that person's week and
// nowhere else, so it can never pollute Discover or a feed. `withWho` is free
// text, not a users reference; naming your coach is not the same as putting
// them on the platform, and every name in here is an invite lead.
// It carries what a class carries, because it is one: the same form fills it
// in, and a class you go to deserves a description and a picture as much as a
// class you teach. The columns mirror `classes` field for field so `runsOn`
// can read one without translation. What it still doesn't have is any way to
// be published: no `isPublic`, no owner but you.
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
}, (t) => [index("personal_classes_user").on(t.userId)]);

// "This class isn't right": not a real class, wrong time, wrong place. Keyed
// on the seriesId rather than a class row, because an edit deletes and
// reinserts the rows and a delete removes them; the report is about the class
// as a person understands it, and the series is that. No FK on the series (it
// has no table), so nothing here can make an edit fail. One report per person
// per class; a second tap changes nothing, which is also what it should do.
export const classReports = pgTable(
  "class_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    seriesId: uuid("series_id").notNull(),
    // Denormalised so the admin list renders without chasing class rows that
    // may already be gone. Both are users FKs: adminDeleteUser must clear
    // reports in both directions.
    coachUserId: uuid("coach_user_id").notNull().references(() => users.id),
    reporterUserId: uuid("reporter_user_id").notNull().references(() => users.id),
    reason: text("reason").notNull(),
    note: text("note").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("class_reports_once").on(t.seriesId, t.reporterUserId)],
);

// Somebody flags a studio that isn't right: closed, wrong address, not a real
// place. A studio has a stable id, so unlike a class this can point straight
// at the row. reporter is a users FK: adminDeleteUser must clear it.
export const studioReports = pgTable(
  "studio_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studioId: uuid("studio_id")
      .notNull()
      .references(() => studios.id),
    reporterUserId: uuid("reporter_user_id").notNull().references(() => users.id),
    reason: text("reason").notNull(),
    note: text("note").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("studio_reports_once").on(t.studioId, t.reporterUserId)],
);

// "Suggest an edit" on a studio page. Deliberately identity-light: name and
// email are free text, because the person most worth hearing from (the owner)
// probably has no account yet. Relation is what makes it a lead, not a
// correction: an owner writing in is the seed of studio claiming.
export const studioSuggestions = pgTable("studio_suggestions", {
  id: uuid("id").primaryKey().defaultRandom(),
  studioId: uuid("studio_id")
    .notNull()
    .references(() => studios.id),
  name: text("name").notNull().default(""),
  email: text("email").notNull(),
  relation: text("relation").notNull().default(""),
  message: text("message").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// A follow waiting on a yes. Deliberately its own table rather than a state
// on subscribers, so a subscribers row keeps meaning exactly one thing: an
// active follow. Both columns are users FKs: adminDeleteUser clears both
// directions.
export const followRequests = pgTable(
  "follow_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    trainerUserId: uuid("trainer_user_id").notNull().references(() => users.id),
    requesterUserId: uuid("requester_user_id").notNull().references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("follow_requests_once").on(t.trainerUserId, t.requesterUserId),
    index("follow_requests_requester").on(t.requesterUserId, t.trainerUserId),
  ],
);

export const blocks = pgTable(
  "blocks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Who did the blocking, and who they blocked. Directional: blocking someone
    // says nothing about whether they blocked you.
    blockerUserId: uuid("blocker_user_id").notNull().references(() => users.id),
    blockedUserId: uuid("blocked_user_id").notNull().references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("blocks_pair").on(t.blockerUserId, t.blockedUserId),
    index("blocks_blocked").on(t.blockedUserId),
  ],
);

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
    /** When this follower last opened this coach's peek.
     *
     *  The ring on the circle is what makes the tray a tool rather than a row
     *  of decoration: it says this coach has put classes up since you last
     *  looked. Following stopped delivering classes to your week, so the ring
     *  is the only thing left that tells you there is anything to pull, and a
     *  tray of identical circles asks people to check six coaches one at a
     *  time to find out.
     *
     *  Null means never opened, which is a ring: somebody you just followed
     *  and have not looked at has, by definition, everything new. */
    peekedAt: timestamp("peeked_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("subscribers_trainer_email").on(t.trainerUserId, t.email),
    // "Who do I follow" is asked by email on every feed, week, and profile
    // load; the unique index above leads with the trainer, so it can't serve
    // that lookup.
    index("subscribers_email").on(t.email),
  ],
);

// A small, deliberate front row inside Following. Following can be broad;
// pinning says which people and places should stay within immediate reach.
// Entity ids are text because people and studios are separate tables, while
// the type makes the pair unambiguous and keeps either side independently
// removable without changing the follow relationship itself.
export const calendarPins = pgTable(
  "calendar_pins",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("calendar_pins_user_entity").on(t.userId, t.entityType, t.entityId)],
);

// "I'm going" — a member marking a class they intend to attend. Deliberately
// NOT a booking: most classes are reserved through the studio, so this is a
// personal note that drives their week and their share image, nothing more.
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
  (t) => [
    uniqueIndex("attendances_user_class_date").on(t.userId, t.classId, t.occurrenceDate),
    index("attendances_class_date").on(t.classId, t.occurrenceDate),
  ],
);

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
  (t) => [
    index("notifications_user_created").on(t.userId, t.createdAt),
    index("notifications_user_read").on(t.userId, t.readAt),
  ],
);

// First-party, privacy-limited product telemetry for the admin pulse. Rows say
// which broad feature was used, never what somebody searched, wrote, shared,
// or who they favorited. Keeping this structured (rather than a freeform JSON
// bucket) makes accidental collection of private content much harder.
export const productActivity = pgTable(
  "product_activity",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    kind: text("kind").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("product_activity_created").on(t.createdAt)],
);

export const pageVisits = pgTable(
  "page_visits",
  {
    trainerUserId: uuid("trainer_user_id").notNull().references(() => users.id),
    date: date("date").notNull(),
    count: integer("count").notNull().default(0), // profile views
    scheduleOpens: integer("schedule_opens").notNull().default(0), // schedule viewed
  },
  (t) => [uniqueIndex("page_visits_trainer_date").on(t.trainerUserId, t.date)],
);

// Positive, lightweight endorsements. Fixed traits keep this useful social
// proof rather than turning profiles into review pages or public criticism.
export const profileEndorsements = pgTable(
  "profile_endorsements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    targetUserId: uuid("target_user_id").notNull().references(() => users.id),
    endorserUserId: uuid("endorser_user_id").notNull().references(() => users.id),
    trait: text("trait").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("profile_endorsements_person_trait").on(t.targetUserId, t.endorserUserId, t.trait),
    index("profile_endorsements_target").on(t.targetUserId),
  ],
);

// Studios earn the same lightweight social proof as coaches, but keep their
// own vocabulary and table so a place is never forced into being a user.
export const studioEndorsements = pgTable(
  "studio_endorsements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    targetStudioId: uuid("target_studio_id").notNull().references(() => studios.id),
    endorserUserId: uuid("endorser_user_id").notNull().references(() => users.id),
    trait: text("trait").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("studio_endorsements_place_trait").on(t.targetStudioId, t.endorserUserId, t.trait),
    index("studio_endorsements_target").on(t.targetStudioId),
    index("studio_endorsements_endorser_trait").on(t.endorserUserId, t.trait),
  ],
);

// Private crews a person keeps together. Groups begin as a lightweight
// favorites organizer; shared scheduling and conversation can build on the
// same membership graph without changing how a group is created.
export const groups = pgTable(
  "groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    photo: text("photo"),
    slug: text("slug").notNull().unique(),
    description: text("description"),
    purpose: text("purpose").notNull().default("plan"),
    visibility: text("visibility").notNull().default("unlisted"),
    inviteToken: text("invite_token").notNull().unique(),
    ownerUserId: uuid("owner_user_id").notNull().references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("groups_owner_created").on(t.ownerUserId, t.createdAt)],
);

export const groupMembers = pgTable(
  "group_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id").notNull().references(() => groups.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("group_members_group_user").on(t.groupId, t.userId),
    index("group_members_user").on(t.userId),
  ],
);

export const groupFavorites = pgTable(
  "group_favorites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id").notNull().references(() => groups.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("group_favorites_group_user").on(t.groupId, t.userId),
    index("group_favorites_user").on(t.userId),
  ],
);

export const groupInvitations = pgTable(
  "group_invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id").notNull().references(() => groups.id, { onDelete: "cascade" }),
    inviteeUserId: uuid("invitee_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    invitedByUserId: uuid("invited_by_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("group_invitations_group_invitee").on(t.groupId, t.inviteeUserId),
    index("group_invitations_invitee").on(t.inviteeUserId),
  ],
);

export const groupClasses = pgTable(
  "group_classes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id").notNull().references(() => groups.id, { onDelete: "cascade" }),
    classId: uuid("class_id").notNull().references(() => classes.id, { onDelete: "cascade" }),
    occurrenceDate: date("occurrence_date", { mode: "string" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("group_classes_group_class_date").on(t.groupId, t.classId, t.occurrenceDate),
    index("group_classes_group").on(t.groupId),
  ],
);

// A group's conversation stays attached to its plans. Class activity is a
// post too, so comments and reactions use one feed instead of a parallel chat.
export const groupPosts = pgTable(
  "group_posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id").notNull().references(() => groups.id, { onDelete: "cascade" }),
    authorUserId: uuid("author_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull().default("update"),
    body: text("body"),
    classId: uuid("class_id").references(() => classes.id, { onDelete: "cascade" }),
    occurrenceDate: date("occurrence_date", { mode: "string" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("group_posts_group_created").on(t.groupId, t.createdAt),
    uniqueIndex("group_posts_class_activity").on(t.groupId, t.classId, t.occurrenceDate, t.kind),
  ],
);

export const groupPostComments = pgTable(
  "group_post_comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id").notNull().references(() => groupPosts.id, { onDelete: "cascade" }),
    authorUserId: uuid("author_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("group_post_comments_post_created").on(t.postId, t.createdAt)],
);

export const groupPostReactions = pgTable(
  "group_post_reactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id").notNull().references(() => groupPosts.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    reaction: text("reaction").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("group_post_reactions_post_user_reaction").on(t.postId, t.userId, t.reaction),
    index("group_post_reactions_post").on(t.postId),
  ],
);

// A short, personal recommendation. Unlike badges these are freeform, and
// unlike reviews they are never scored or published by default: the person
// or place receiving one decides whether it belongs on their public profile.
export const shoutouts = pgTable(
  "shoutouts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    authorUserId: uuid("author_user_id").notNull().references(() => users.id),
    targetUserId: uuid("target_user_id").references(() => users.id),
    targetStudioId: uuid("target_studio_id").references(() => studios.id),
    body: text("body").notNull(),
    featuredAt: timestamp("featured_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("shoutouts_author_user").on(t.authorUserId, t.targetUserId),
    uniqueIndex("shoutouts_author_studio").on(t.authorUserId, t.targetStudioId),
    index("shoutouts_target_user").on(t.targetUserId, t.createdAt),
    index("shoutouts_target_studio").on(t.targetStudioId, t.createdAt),
  ],
);

// One row per trainer who connected Google Calendar. We mirror their classes
// into their calendar (one-way); syncedEventIds tracks the events we created so
// a re-sync can clear and repopulate without touching their personal events.
export const googleConnections = pgTable("google_connections", {
  userId: uuid("user_id").primaryKey().references(() => users.id),
  refreshToken: text("refresh_token").notNull(), // AES-256-GCM encrypted
  calendarId: text("calendar_id").notNull().default("primary"),
  timeZone: text("time_zone"),
  email: text("email"),
  syncedEventIds: jsonb("synced_event_ids").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const messageLog = pgTable("message_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  toAddress: text("to_address").notNull(),
  kind: text("kind").notNull(), // otp | schedule_change | welcome
  body: text("body").notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  status: text("status").notNull().default("sent"),
});

export const authCodes = pgTable(
  "auth_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    codeHash: text("code_hash").notNull(),
    ip: text("ip"),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("auth_codes_email").on(t.email)],
);

// Single-use magic sign-in links. We email the raw token inside a URL and only
// keep its hash; a click that matches an unconsumed, unexpired row logs in.
export const magicLinks = pgTable(
  "magic_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    tokenHash: text("token_hash").notNull(),
    ip: text("ip"),
    via: text("via"), // growth-loop attribution carried through signup
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("magic_links_email").on(t.email)],
);

// WebAuthn passkeys (Face ID / Touch ID / fingerprint / security keys). One row
// per registered credential; a user can enroll several devices.
export const credentials = pgTable(
  "credentials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id),
    credentialId: text("credential_id").notNull().unique(), // base64url
    publicKey: text("public_key").notNull(), // base64
    counter: integer("counter").notNull().default(0),
    transports: jsonb("transports").$type<string[]>().notNull().default([]),
    label: text("label").notNull().default("Passkey"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  },
  (t) => [index("credentials_user").on(t.userId)],
);
