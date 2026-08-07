ALTER TABLE "studios" ADD COLUMN "lat" double precision;--> statement-breakpoint
ALTER TABLE "studios" ADD COLUMN "lng" double precision;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "location_lat" double precision;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "location_lng" double precision;