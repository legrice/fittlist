ALTER TABLE "attendances" ADD COLUMN IF NOT EXISTS "companions" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "event_attendances" ADD COLUMN IF NOT EXISTS "companions" jsonb DEFAULT '[]'::jsonb NOT NULL;
