CREATE TABLE "calendar_activity_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"occurrence_date" date NOT NULL,
	"activity_kind" text NOT NULL,
	"author_user_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calendar_activity_likes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"occurrence_date" date NOT NULL,
	"activity_kind" text NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "calendar_activity_comments" ADD CONSTRAINT "calendar_activity_comments_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_activity_comments" ADD CONSTRAINT "calendar_activity_comments_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_activity_comments" ADD CONSTRAINT "calendar_activity_comments_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_activity_likes" ADD CONSTRAINT "calendar_activity_likes_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_activity_likes" ADD CONSTRAINT "calendar_activity_likes_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_activity_likes" ADD CONSTRAINT "calendar_activity_likes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calendar_activity_comments_activity" ON "calendar_activity_comments" USING btree ("actor_user_id","class_id","occurrence_date","activity_kind","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_activity_likes_unique" ON "calendar_activity_likes" USING btree ("actor_user_id","class_id","occurrence_date","activity_kind","user_id");--> statement-breakpoint
CREATE INDEX "calendar_activity_likes_activity" ON "calendar_activity_likes" USING btree ("actor_user_id","class_id","occurrence_date","activity_kind");