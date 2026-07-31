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
} from "drizzle-orm/pg-core";

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
    .$type<{ headline?: string; showPhoto?: boolean; theme?: string }>()
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
  (t) => [uniqueIndex("inquiry_thread_coach_email").on(t.coachUserId, t.requesterEmail, t.kind)],
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
  (t) => [uniqueIndex("coach_studios_user_studio").on(t.userId, t.studioId)],
);

// Global/shared directory. `seq` gives the deterministic directory index that
// drives the studio color cycle (Sky, Tacha, Sand, Olive).
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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

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
    startTime: text("start_time").notNull(), // "HH:MM" 24h
    durationMin: integer("duration_min").notNull(),
    // Null for private items with no listed studio; `location` holds a free-form
    // place ("Client's home", "Online") in that case.
    studioId: uuid("studio_id").references(() => studios.id),
    location: text("location"),
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
    // false = private (own schedule only, hidden from the public page).
    isPublic: boolean("is_public").notNull().default(true),
    links: jsonb("links").$type<BookingLink[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("classes_user").on(t.userId)],
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
export const personalClasses = pgTable("personal_classes", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  dayOfWeek: integer("day_of_week").notNull(), // 0 = Monday, same as classes
  startTime: text("start_time").notNull(), // "HH:MM", floating, same as classes
  durationMin: integer("duration_min").notNull().default(60),
  location: text("location").notNull().default(""),
  withWho: text("with_who").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

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
  (t) => [uniqueIndex("follow_requests_once").on(t.trainerUserId, t.requesterUserId)],
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
  (t) => [uniqueIndex("blocks_pair").on(t.blockerUserId, t.blockedUserId)],
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
export const attendances = pgTable(
  "attendances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id),
    classId: uuid("class_id").notNull().references(() => classes.id),
    // The specific day they're going. Classes are recurring templates, so
    // without a date "going" would mean every future Tuesday forever.
    occurrenceDate: date("occurrence_date").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("attendances_user_class_date").on(t.userId, t.classId, t.occurrenceDate)],
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
  (t) => [index("notifications_user_created").on(t.userId, t.createdAt)],
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
