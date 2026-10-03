CREATE TYPE "public"."achievement_rule" AS ENUM('wagers_count', 'single_stake', 'all_in', 'wins_count', 'win_streak', 'broke', 'bets_created', 'purchases_count');--> statement-breakpoint
CREATE TYPE "public"."cosmetic_type" AS ENUM('avatar', 'border');--> statement-breakpoint
CREATE TABLE "achievements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"rule_type" "achievement_rule" NOT NULL,
	"rule_value" integer,
	"reward" integer NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "achievements_key_unique" UNIQUE("key"),
	CONSTRAINT "achievements_reward_positive" CHECK ("achievements"."reward" >= 0),
	CONSTRAINT "achievements_rule_value_positive" CHECK ("achievements"."rule_value" is null or "achievements"."rule_value" > 0)
);
--> statement-breakpoint
CREATE TABLE "cosmetics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "cosmetic_type" NOT NULL,
	"name" text NOT NULL,
	"image_url" text,
	"tint_color" text,
	"price" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cosmetics_price_positive" CHECK ("cosmetics"."price" >= 0),
	CONSTRAINT "cosmetics_tint_format" CHECK ("cosmetics"."tint_color" is null or "cosmetics"."tint_color" ~ '^#[0-9A-Fa-f]{6}$')
);
--> statement-breakpoint
CREATE TABLE "member_achievements" (
	"league_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"achievement_id" uuid NOT NULL,
	"unlocked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "member_achievements_league_id_user_id_achievement_id_pk" PRIMARY KEY("league_id","user_id","achievement_id")
);
--> statement-breakpoint
CREATE TABLE "member_cosmetics" (
	"league_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"cosmetic_id" uuid NOT NULL,
	"price_paid" integer NOT NULL,
	"acquired_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "member_cosmetics_league_id_user_id_cosmetic_id_pk" PRIMARY KEY("league_id","user_id","cosmetic_id"),
	CONSTRAINT "member_cosmetics_price_positive" CHECK ("member_cosmetics"."price_paid" >= 0)
);
--> statement-breakpoint
ALTER TABLE "league_members" ADD COLUMN "avatar_cosmetic_id" uuid;--> statement-breakpoint
ALTER TABLE "league_members" ADD COLUMN "border_cosmetic_id" uuid;--> statement-breakpoint
ALTER TABLE "member_achievements" ADD CONSTRAINT "member_achievements_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_achievements" ADD CONSTRAINT "member_achievements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_achievements" ADD CONSTRAINT "member_achievements_achievement_id_achievements_id_fk" FOREIGN KEY ("achievement_id") REFERENCES "public"."achievements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_cosmetics" ADD CONSTRAINT "member_cosmetics_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_cosmetics" ADD CONSTRAINT "member_cosmetics_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_cosmetics" ADD CONSTRAINT "member_cosmetics_cosmetic_id_cosmetics_id_fk" FOREIGN KEY ("cosmetic_id") REFERENCES "public"."cosmetics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_members" ADD CONSTRAINT "league_members_avatar_cosmetic_id_cosmetics_id_fk" FOREIGN KEY ("avatar_cosmetic_id") REFERENCES "public"."cosmetics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_members" ADD CONSTRAINT "league_members_border_cosmetic_id_cosmetics_id_fk" FOREIGN KEY ("border_cosmetic_id") REFERENCES "public"."cosmetics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Catalogue de départ (docs/M6.md) : six bordures, aucun avatar.
INSERT INTO "cosmetics" ("type", "name", "tint_color", "price", "position") VALUES
	('border', 'Laiton', '#F2B632', 0, 1),
	('border', 'Zinc', '#A9B0B8', 20, 2),
	('border', 'Carotte', '#F4776A', 30, 3),
	('border', 'Enseigne', '#3DDC97', 40, 4),
	('border', 'Papier', '#F3F1E7', 60, 5),
	('border', 'Nuit', '#66717E', 80, 6);
--> statement-breakpoint
-- Douze succès, 140 clopes au total par joueur et par ligue.
INSERT INTO "achievements" ("key", "name", "rule_type", "rule_value", "reward", "hidden", "position") VALUES
	('first_ticket', 'Premier ticket', 'wagers_count', 1, 5, false, 1),
	('regular', 'Habitué', 'wagers_count', 10, 10, false, 2),
	('pillar', 'Pilier de comptoir', 'wagers_count', 50, 20, false, 3),
	('high_roller', 'Flambeur', 'single_stake', 20, 10, false, 4),
	('first_win', 'Première gagne', 'wins_count', 1, 5, false, 5),
	('hot_hand', 'Main chaude', 'wins_count', 10, 15, false, 6),
	('streak_3', 'Série de 3', 'win_streak', 3, 15, false, 7),
	('streak_5', 'Série de 5', 'win_streak', 5, 25, false, 8),
	('bookmaker', 'Bookmaker', 'bets_created', 5, 10, false, 9),
	('dandy', 'Coquet', 'purchases_count', 1, 5, false, 10),
	('all_in', 'Tapis', 'all_in', 10, 10, true, 11),
	('broke', 'À sec', 'broke', NULL, 10, true, 12);
