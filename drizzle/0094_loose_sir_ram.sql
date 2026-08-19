CREATE INDEX "attendances_class_date" ON "attendances" USING btree ("class_id","occurrence_date");--> statement-breakpoint
CREATE INDEX "blocks_blocked" ON "blocks" USING btree ("blocked_user_id");--> statement-breakpoint
CREATE INDEX "classes_coach" ON "classes" USING btree ("coach_user_id");--> statement-breakpoint
CREATE INDEX "classes_studio" ON "classes" USING btree ("studio_id");--> statement-breakpoint
CREATE INDEX "coach_studios_studio" ON "coach_studios" USING btree ("studio_id");--> statement-breakpoint
CREATE INDEX "follow_requests_requester" ON "follow_requests" USING btree ("requester_user_id","trainer_user_id");--> statement-breakpoint
CREATE INDEX "inquiry_thread_requester_kind" ON "inquiry_threads" USING btree ("requester_email","kind");--> statement-breakpoint
CREATE INDEX "notifications_user_read" ON "notifications" USING btree ("user_id","read_at");--> statement-breakpoint
CREATE INDEX "personal_classes_user" ON "personal_classes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "studio_endorsements_endorser_trait" ON "studio_endorsements" USING btree ("endorser_user_id","trait");--> statement-breakpoint
CREATE INDEX "studio_managers_user" ON "studio_managers" USING btree ("user_id");