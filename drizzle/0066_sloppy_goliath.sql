ALTER TABLE "personal_classes" ADD COLUMN "studio_id" uuid;--> statement-breakpoint
ALTER TABLE "personal_classes" ADD COLUMN "class_type" text;--> statement-breakpoint
ALTER TABLE "personal_classes" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "personal_classes" ADD COLUMN "image" text;--> statement-breakpoint
ALTER TABLE "personal_classes" ADD COLUMN "links" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "personal_classes" ADD COLUMN "specific_date" text;--> statement-breakpoint
ALTER TABLE "personal_classes" ADD COLUMN "ends_on" text;--> statement-breakpoint
ALTER TABLE "personal_classes" ADD CONSTRAINT "personal_classes_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE no action ON UPDATE no action;