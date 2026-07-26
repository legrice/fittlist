import {
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
  name: text("name").notNull().default(""),
  handle: text("handle").unique(),
  // Public profile: a short bio and a photo (stored as a small data URL).
  about: text("about"),
  photo: text("photo"),
  // A short role/tagline shown under the name (e.g. "Strength coach").
  title: text("title"),
  // Optional social links surfaced as buttons on the public profile.
  instagram: text("instagram"),
  website: text("website"),
  // e.g. "footer:matt" - set at claim time when signup came through the
  // public-page footer. One of the three §8 success metrics.
  signupSource: text("signup_source"),
  // Visual style for this trainer's app + public page: "classic" | "blocks" | "poster".
  theme: text("theme").notNull().default("poster"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

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
    startTime: text("start_time").notNull(), // "HH:MM" 24h
    durationMin: integer("duration_min").notNull(),
    studioId: uuid("studio_id").notNull().references(() => studios.id),
    links: jsonb("links").$type<BookingLink[]>().notNull().default([]),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("class_templates_user_name").on(t.userId, t.name)],
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
    studioId: uuid("studio_id").notNull().references(() => studios.id),
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
