CREATE TABLE "studio_classes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid NOT NULL,
	"name" text NOT NULL,
	"name_key" text NOT NULL,
	"class_type" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "class_templates" ADD COLUMN "class_type" text;--> statement-breakpoint
ALTER TABLE "classes" ADD COLUMN "class_type" text;--> statement-breakpoint
ALTER TABLE "studio_classes" ADD CONSTRAINT "studio_classes_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_classes" ADD CONSTRAINT "studio_classes_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "studio_classes_studio_name" ON "studio_classes" USING btree ("studio_id","name_key");