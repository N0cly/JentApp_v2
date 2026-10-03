ALTER TYPE "public"."notification_type" ADD VALUE 'announcement';--> statement-breakpoint
ALTER TABLE "notifications" ALTER COLUMN "league_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_league_by_type" CHECK (("notifications"."league_id" is null) = ("notifications"."type"::text = 'announcement'));