CREATE TABLE "shift_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"occurrence_date" date NOT NULL,
	"kind" text NOT NULL,
	"from_user_id" uuid,
	"to_user_id" uuid NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"decided_by_user_id" uuid,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "studios" ADD COLUMN "approve_shift_changes" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "shift_requests" ADD CONSTRAINT "shift_requests_studio_id_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."studios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_requests" ADD CONSTRAINT "shift_requests_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_requests" ADD CONSTRAINT "shift_requests_from_user_id_users_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_requests" ADD CONSTRAINT "shift_requests_to_user_id_users_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_requests" ADD CONSTRAINT "shift_requests_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "shift_requests_live" ON "shift_requests" USING btree ("class_id","occurrence_date","to_user_id","state");--> statement-breakpoint
CREATE INDEX "shift_requests_studio_state" ON "shift_requests" USING btree ("studio_id","state");