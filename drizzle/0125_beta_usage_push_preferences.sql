ALTER TABLE "native_push_devices" ADD COLUMN "updates" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
CREATE INDEX "product_activity_actor_kind_created" ON "product_activity" ("actor_user_id", "kind", "created_at");
