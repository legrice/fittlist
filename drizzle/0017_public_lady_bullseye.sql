ALTER TABLE "class_templates" ALTER COLUMN "studio_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "classes" ALTER COLUMN "studio_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "class_templates" ADD COLUMN "location" text;--> statement-breakpoint
ALTER TABLE "class_templates" ADD COLUMN "is_public" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "classes" ADD COLUMN "location" text;--> statement-breakpoint
ALTER TABLE "classes" ADD COLUMN "is_public" boolean DEFAULT true NOT NULL;