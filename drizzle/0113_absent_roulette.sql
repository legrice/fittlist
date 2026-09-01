ALTER TABLE "users" ADD COLUMN "away" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "away_banner" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "away_message" text;