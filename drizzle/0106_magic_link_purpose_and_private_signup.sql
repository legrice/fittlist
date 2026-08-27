ALTER TABLE "users" ALTER COLUMN "discoverable" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "magic_links" ADD COLUMN "purpose" text DEFAULT 'login' NOT NULL;