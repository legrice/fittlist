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
  // e.g. "footer:matt" - set at claim time when signup came through the
  // public-page footer. One of the three §8 success metrics.
  signupSource: text("signup_source"),
  // Visual style for this trainer's app + public page: "classic" | "blocks" | "poster".
  theme: text("theme").notNull().default("poster"),
  // Set when the coach finishes (or skips) the post-signup setup wizard. Null =
  // they still need to run it; the app redirects them into /welcome until it's set.
  onboardedAt: timestamp("onboarded_at", { withTimezone: true }),
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
    requesterName: text("requester_name").notNull().default(""),
    requesterEmail: text("requester_email").notNull(), // normalized lowercase
    coachUnread: integer("coach_unread").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("inquiry_thread_coach_email").on(t.coachUserId, t.requesterEmail)],
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
  name: text("name").notNull(),
  address: text("address").notNull(),
  createdByUserId: uuid("created_by_user_id").references(() => users.id),
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
    templateId: uuid("template_id").references(() => classTemplates.id),
    dayOfWeek: integer("day_of_week").notNull(),
    // null = standing weekly (shows every week, link never stales); set = a
    // one-off pinned to this ISO date, shown only in the week it falls in.
    specificDate: date("specific_date"),
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

export const subscribers = pgTable(
  "subscribers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    trainerUserId: uuid("trainer_user_id").notNull().references(() => users.id),
    email: text("email").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    optedOutAt: timestamp("opted_out_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("subscribers_trainer_email").on(t.trainerUserId, t.email)],
);

export const pageVisits = pgTable(
  "page_visits",
  {
    trainerUserId: uuid("trainer_user_id").notNull().references(() => users.id),
    date: date("date").notNull(),
    count: integer("count").notNull().default(0),
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
