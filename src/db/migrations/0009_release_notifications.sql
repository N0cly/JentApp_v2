ALTER TYPE "public"."notification_type" ADD VALUE 'release';--> statement-breakpoint
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_league_by_type";--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_league_by_type" CHECK (("notifications"."league_id" is null) = ("notifications"."type"::text in ('announcement', 'release')));