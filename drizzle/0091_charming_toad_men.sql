CREATE TABLE "group_post_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"author_user_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_post_reactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"reaction" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"author_user_id" uuid NOT NULL,
	"kind" text DEFAULT 'update' NOT NULL,
	"body" text,
	"class_id" uuid,
	"occurrence_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "group_post_comments" ADD CONSTRAINT "group_post_comments_post_id_group_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."group_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_post_comments" ADD CONSTRAINT "group_post_comments_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_post_reactions" ADD CONSTRAINT "group_post_reactions_post_id_group_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."group_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_post_reactions" ADD CONSTRAINT "group_post_reactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_posts" ADD CONSTRAINT "group_posts_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_posts" ADD CONSTRAINT "group_posts_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_posts" ADD CONSTRAINT "group_posts_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "group_post_comments_post_created" ON "group_post_comments" USING btree ("post_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "group_post_reactions_post_user_reaction" ON "group_post_reactions" USING btree ("post_id","user_id","reaction");--> statement-breakpoint
CREATE INDEX "group_post_reactions_post" ON "group_post_reactions" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "group_posts_group_created" ON "group_posts" USING btree ("group_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "group_posts_class_activity" ON "group_posts" USING btree ("group_id","class_id","occurrence_date","kind");