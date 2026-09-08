ALTER TABLE "attendances" ADD COLUMN "checked_in_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "classes" ADD COLUMN "registration_capacity" integer;--> statement-breakpoint
ALTER TABLE "magic_links" ADD COLUMN "registration" jsonb;--> statement-breakpoint
ALTER TABLE "studios" ADD COLUMN "registration_date" date;