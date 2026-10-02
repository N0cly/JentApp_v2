CREATE TABLE "ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"delta" integer NOT NULL,
	"reason" text NOT NULL,
	"ref_id" uuid,
	"unique_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_unique_key_unique" UNIQUE("unique_key"),
	CONSTRAINT "ledger_delta_not_zero" CHECK ("ledger"."delta" <> 0)
);
--> statement-breakpoint
ALTER TABLE "ledger" ADD CONSTRAINT "ledger_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger" ADD CONSTRAINT "ledger_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ledger_member_idx" ON "ledger" USING btree ("league_id","user_id","created_at");--> statement-breakpoint
-- Le journal ne se modifie jamais.
CREATE FUNCTION ledger_forbid_update() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ledger: une ligne de journal ne se modifie pas';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER ledger_no_update BEFORE UPDATE ON "ledger"
  FOR EACH ROW EXECUTE FUNCTION ledger_forbid_update();--> statement-breakpoint
-- Il ne se supprime qu'avec sa ligue (suppression en cascade).
CREATE FUNCTION ledger_forbid_delete() RETURNS trigger AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "leagues" WHERE "id" = OLD."league_id") THEN
    RAISE EXCEPTION 'ledger: une ligne de journal ne se supprime qu''avec sa ligue';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER ledger_no_delete BEFORE DELETE ON "ledger"
  FOR EACH ROW EXECUTE FUNCTION ledger_forbid_delete();--> statement-breakpoint
-- Dotation de départ des membres arrivés avant M2 : une ligne et le solde.
INSERT INTO "ledger" ("league_id", "user_id", "delta", "reason", "unique_key")
SELECT m."league_id", m."user_id", l."join_grant", 'join_grant',
       'join:' || m."league_id" || ':' || m."user_id"
FROM "league_members" m
JOIN "leagues" l ON l."id" = m."league_id"
WHERE l."join_grant" > 0
ON CONFLICT ("unique_key") DO NOTHING;--> statement-breakpoint
UPDATE "league_members" m
SET "balance" = m."balance" + l."join_grant"
FROM "leagues" l
WHERE l."id" = m."league_id" AND l."join_grant" > 0;
