ALTER TABLE "users" ADD COLUMN "last_seen_release" text;--> statement-breakpoint
-- Les comptes existants ont déjà la 2.0.0, version en ligne à cette migration : pas de feuille pour elle.
UPDATE "users" SET "last_seen_release" = '2.0.0' WHERE "last_seen_release" IS NULL;
