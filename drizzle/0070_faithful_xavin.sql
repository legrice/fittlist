ALTER TABLE "studio_rota_coaches" ADD COLUMN "state" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "studio_rota_coaches" ADD COLUMN "invited_email" text;--> statement-breakpoint
ALTER TABLE "studio_rota_coaches" ADD COLUMN "invited_phone" text;--> statement-breakpoint
ALTER TABLE "studio_rota_coaches" ADD COLUMN "invited_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "studio_rota_coaches" ADD COLUMN "accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "studio_rota_coaches" ADD COLUMN "source" text;