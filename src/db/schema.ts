import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

// M0 : table de validation du pipeline de migrations.
export const appMeta = pgTable("app_meta", {
  key: text("key").primaryKey(),
  value: text("value"),
});

// --- Better Auth -----------------------------------------------------------
// Les noms de propriétés sont ceux qu'attend Better Auth ; `name` est le pseudo.

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Pseudo. Vide une fois le compte supprimé.
    name: text("username"),
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    isSuperAdmin: boolean("is_super_admin").notNull().default(false),
    termsAcceptedAt: timestamp("terms_accepted_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("users_username_lower_idx").on(sql`lower(${t.name})`)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    token: text("token").notNull().unique(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("sessions_user_id_idx").on(t.userId)],
);

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    // Mot de passe haché (scrypt).
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("accounts_user_id_idx").on(t.userId)],
);

export const verifications = pgTable(
  "verifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("verifications_identifier_idx").on(t.identifier)],
);

// --- Ligues ----------------------------------------------------------------

export const leagues = pgTable(
  "leagues",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    inviteCode: text("invite_code").notNull().unique(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id),
    joinGrant: integer("join_grant").notNull().default(50),
    weeklyGrant: integer("weekly_grant").notNull().default(10),
    seedAmount: integer("seed_amount").notNull().default(5),
    createdAt: createdAt(),
  },
  (t) => [
    check("leagues_join_grant_range", sql`${t.joinGrant} between 0 and 200`),
    check("leagues_weekly_grant_range", sql`${t.weeklyGrant} between 0 and 50`),
    check("leagues_seed_amount_range", sql`${t.seedAmount} between 0 and 20`),
  ],
);

export const leagueRole = pgEnum("league_role", ["player", "admin", "owner"]);

export const leagueMembers = pgTable(
  "league_members",
  {
    leagueId: uuid("league_id")
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    role: leagueRole("role").notNull().default("player"),
    // Écrit uniquement par src/server/ledger (M2).
    balance: integer("balance").notNull().default(0),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
    leftAt: timestamp("left_at", { withTimezone: true }),
  },
  (t) => [
    primaryKey({ columns: [t.leagueId, t.userId] }),
    check("league_members_balance_positive", sql`${t.balance} >= 0`),
    uniqueIndex("league_members_one_owner_idx")
      .on(t.leagueId)
      .where(sql`${t.role} = 'owner' and ${t.leftAt} is null`),
    index("league_members_user_id_idx").on(t.userId),
  ],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leagueId: uuid("league_id")
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").references(() => users.id),
    action: text("action").notNull(),
    details: jsonb("details").notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("audit_log_league_idx").on(t.leagueId, t.createdAt)],
);

// --- Paris -----------------------------------------------------------------
// L'état d'un pari n'est jamais stocké : il se déduit de ses dates (betState).

export const betMoment = pgEnum("bet_moment", ["BEFORE", "NIGHT", "AFTER", "DAILY", "SPECIAL"]);
export const cancelReason = pgEnum("bet_cancel_reason", ["creator", "admin", "tie", "expired"]);

export const bets = pgTable(
  "bets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leagueId: uuid("league_id")
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    question: text("question").notNull(),
    moment: betMoment("moment").notNull(),
    hiddenUntilOpen: boolean("hidden_until_open").notNull().default(false),
    opensAt: timestamp("opens_at", { withTimezone: true }).notNull(),
    closesAt: timestamp("closes_at", { withTimezone: true }).notNull(),
    // Cagnotte, décidée à la saisie du résultat.
    seed: integer("seed").notNull().default(0),
    winningOptionId: uuid("winning_option_id").references((): AnyPgColumn => betOptions.id),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedBy: uuid("resolved_by").references(() => users.id),
    settledAt: timestamp("settled_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    // Vide quand l'annulation est automatique (expiration).
    cancelledBy: uuid("cancelled_by").references(() => users.id),
    cancelReason: cancelReason("cancel_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("bets_league_closes_idx").on(t.leagueId, t.closesAt),
    check("bets_seed_positive", sql`${t.seed} >= 0`),
    check("bets_dates_order", sql`${t.closesAt} > ${t.opensAt}`),
  ],
);

export const betOptions = pgTable(
  "bet_options",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    betId: uuid("bet_id")
      .notNull()
      .references(() => bets.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    position: integer("position").notNull(),
  },
  (t) => [uniqueIndex("bet_options_position_idx").on(t.betId, t.position)],
);

export const wagers = pgTable(
  "wagers",
  {
    betId: uuid("bet_id")
      .notNull()
      .references(() => bets.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    optionId: uuid("option_id")
      .notNull()
      .references(() => betOptions.id),
    amount: integer("amount").notNull(),
    // Vide tant que rien n'est versé.
    payout: integer("payout"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.betId, t.userId] }),
    check("wagers_amount_positive", sql`${t.amount} > 0`),
    check("wagers_payout_positive", sql`${t.payout} >= 0`),
    index("wagers_option_idx").on(t.optionId),
  ],
);

// --- Journal des clopes ---------------------------------------------------
// Écrit uniquement par src/server/ledger. Une ligne ne se modifie pas et ne se
// supprime pas, sauf avec sa ligue (triggers de la migration 0002).

export const ledger = pgTable(
  "ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leagueId: uuid("league_id")
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    delta: integer("delta").notNull(),
    reason: text("reason").notNull(),
    // Ce qui a causé le mouvement (tournée, pari…).
    refId: uuid("ref_id"),
    // Crédits automatiques : une seule fois par clé.
    uniqueKey: text("unique_key").unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("ledger_member_idx").on(t.leagueId, t.userId, t.createdAt),
    check("ledger_delta_not_zero", sql`${t.delta} <> 0`),
  ],
);

// --- Limitation des tentatives ---------------------------------------------

export const rateLimits = pgTable("rate_limits", {
  // Règle et sujet, par exemple « login:ip:203.0.113.4 ».
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  resetAt: timestamp("reset_at", { withTimezone: true }).notNull(),
});
