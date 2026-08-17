CREATE TABLE IF NOT EXISTS "group_classes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"occurrence_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN IF NOT EXISTS "description" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "group_classes" ADD CONSTRAINT "group_classes_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "group_classes" ADD CONSTRAINT "group_classes_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "group_classes_group_class_date" ON "group_classes" USING btree ("group_id","class_id","occurrence_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "group_classes_group" ON "group_classes" USING btree ("group_id");
