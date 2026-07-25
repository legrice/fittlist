CREATE TABLE "google_connections" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"refresh_token" text NOT NULL,
	"calendar_id" text DEFAULT 'primary' NOT NULL,
	"time_zone" text,
	"email" text,
	"synced_event_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "google_connections" ADD CONSTRAINT "google_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;