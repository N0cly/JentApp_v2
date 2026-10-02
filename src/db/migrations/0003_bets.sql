CREATE TYPE "public"."bet_moment" AS ENUM('BEFORE', 'NIGHT', 'AFTER', 'DAILY', 'SPECIAL');--> statement-breakpoint
CREATE TYPE "public"."bet_cancel_reason" AS ENUM('creator', 'admin', 'tie', 'expired');--> statement-breakpoint
CREATE TABLE "bet_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bet_id" uuid NOT NULL,
	"label" text NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"question" text NOT NULL,
	"moment" "bet_moment" NOT NULL,
	"hidden_until_open" boolean DEFAULT false NOT NULL,
	"opens_at" timestamp with time zone NOT NULL,
	"closes_at" timestamp with time zone NOT NULL,
	"seed" integer DEFAULT 0 NOT NULL,
	"winning_option_id" uuid,
	"resolved_at" timestamp with time zone,
	"resolved_by" uuid,
	"settled_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" uuid,
	"cancel_reason" "bet_cancel_reason",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bets_seed_positive" CHECK ("bets"."seed" >= 0),
	CONSTRAINT "bets_dates_order" CHECK ("bets"."closes_at" > "bets"."opens_at")
);
--> statement-breakpoint
CREATE TABLE "wagers" (
	"bet_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"option_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"payout" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wagers_bet_id_user_id_pk" PRIMARY KEY("bet_id","user_id"),
	CONSTRAINT "wagers_amount_positive" CHECK ("wagers"."amount" > 0),
	CONSTRAINT "wagers_payout_positive" CHECK ("wagers"."payout" >= 0)
);
--> statement-breakpoint
ALTER TABLE "bet_options" ADD CONSTRAINT "bet_options_bet_id_bets_id_fk" FOREIGN KEY ("bet_id") REFERENCES "public"."bets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bets" ADD CONSTRAINT "bets_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bets" ADD CONSTRAINT "bets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bets" ADD CONSTRAINT "bets_winning_option_id_bet_options_id_fk" FOREIGN KEY ("winning_option_id") REFERENCES "public"."bet_options"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bets" ADD CONSTRAINT "bets_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bets" ADD CONSTRAINT "bets_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wagers" ADD CONSTRAINT "wagers_bet_id_bets_id_fk" FOREIGN KEY ("bet_id") REFERENCES "public"."bets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wagers" ADD CONSTRAINT "wagers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wagers" ADD CONSTRAINT "wagers_option_id_bet_options_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."bet_options"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bet_options_position_idx" ON "bet_options" USING btree ("bet_id","position");--> statement-breakpoint
CREATE INDEX "bets_league_closes_idx" ON "bets" USING btree ("league_id","closes_at");--> statement-breakpoint
CREATE INDEX "wagers_option_idx" ON "wagers" USING btree ("option_id");