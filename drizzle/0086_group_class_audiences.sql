CREATE TABLE "group_class_shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"series_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "group_class_shares" ADD CONSTRAINT "group_class_shares_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_class_shares" ADD CONSTRAINT "group_class_shares_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "group_class_shares_group_series" ON "group_class_shares" USING btree ("group_id","series_id");--> statement-breakpoint
CREATE INDEX "group_class_shares_group" ON "group_class_shares" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "group_class_shares_user" ON "group_class_shares" USING btree ("user_id");
