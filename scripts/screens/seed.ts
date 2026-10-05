// Jeu de données extrême (docs/ECRANS.md, § Contenus extrêmes), écrit par les
// fonctions du serveur dans une base à part : chaque limite de la spec poussée
// au bout. Utilisé seulement par `pnpm test:screens`.

import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import sharp from "sharp";
import { getDb } from "@/db/client";
import { betOptions, cosmetics, leagues, users } from "@/db/schema";
import { getAuth } from "@/server/auth";
import { cancelBet, createBet, placeWager, resolveBet, settleDue } from "@/server/bets";
import { sendMessage, sendSticker } from "@/server/chat";
import { createLeague, joinLeague } from "@/server/leagues";
import { post } from "@/server/ledger";
import { purchase } from "@/server/shop";

export const PASSWORD = "motdepasse-ecrans";

export type Seeded = {
  full: { email: string; leagueId: string; inviteCode: string };
  empty: { email: string; leagueId: string };
  bets: { open: string; closed: string; resolved: string; settled: string; scheduled: string };
};

const minutes = (n: number) => new Date(Date.now() + n * 60_000);

/** Compte qui peut se connecter (mot de passe haché par Better Auth). */
async function account(username: string, email: string) {
  await getAuth().api.signUpEmail({
    body: { name: username, email, password: PASSWORD },
    headers: new Headers(),
  });
  const [user] = await getDb().select().from(users).where(eq(users.email, email));
  await getDb().update(users).set({ termsAcceptedAt: new Date() }).where(eq(users.id, user!.id));
  return user!;
}

/** Joueur sans mot de passe, pour remplir une ligue. */
async function filler(username: string) {
  const [user] = await getDb()
    .insert(users)
    .values({ name: username, email: `${username.toLowerCase()}@ecrans.invalid` })
    .returning();
  return user!;
}

async function credit(leagueId: string, userId: string, amount: number) {
  await getDb().transaction((tx) =>
    post(tx, { leagueId, userId, delta: amount, reason: "round", refId: randomUUID() }),
  );
}

async function league(owner: { id: string }, name: string) {
  const created = await createLeague(
    owner,
    { name, joinGrant: 50, weeklyGrant: 10, seedAmount: 5 },
    new Date(),
  );
  if (!created.ok) throw new Error(`ligue ${name} : ${JSON.stringify(created)}`);
  return created.leagueId;
}

async function codeOf(leagueId: string) {
  const [row] = await getDb()
    .select({ code: leagues.inviteCode })
    .from(leagues)
    .where(eq(leagues.id, leagueId));
  return row!.code;
}

async function bet(
  creator: { id: string },
  leagueId: string,
  question: string,
  options: string[],
  createdAt: Date,
  closesAt: Date,
  extra: Record<string, unknown> = {},
) {
  const created = await createBet(
    creator,
    leagueId,
    { question, options, moment: "SPECIAL", closesAt: closesAt.toISOString(), ...extra },
    createdAt,
  );
  if (!created.ok) throw new Error(`pari : ${JSON.stringify(created)}`);
  const options_ = await getDb()
    .select({ id: betOptions.id })
    .from(betOptions)
    .where(eq(betOptions.betId, created.betId))
    .orderBy(asc(betOptions.position));
  return { id: created.betId, options: options_.map((o) => o.id) };
}

async function stake(
  user: { id: string },
  leagueId: string,
  betId: string,
  optionId: string,
  amount: number,
  at: Date,
) {
  const r = await placeWager(
    user,
    leagueId,
    betId,
    { optionId, amount, ticketId: randomUUID() },
    at,
  );
  if (!r.ok) throw new Error(`mise : ${r.error}`);
}

/** 20 caractères, sans espace, en lettres larges. */
const longName = (n: number) => `WWWWWWWWWWWWWWWW_${String(n).padStart(3, "0")}`;
/** 30 caractères, sans espace. */
const longLeague = (n: number) => `Ligue_Des_Incorrigibles_Du_${String(n).padStart(3, "0")}`;
const QUESTION =
  "Est-ce que quelqu'un de la bande va enfin réussir à rentrer avant quatre heures du matin sans oublier ses clés, son téléphone ou sa vestes ?";
/** Même longueur maximale, autre début. */
const variant = (prefix: string) => `${prefix} — ${QUESTION}`.slice(0, 140);
const OPTIONS = Array.from({ length: 8 }, (_, i) =>
  `Option numéro ${i + 1} vraiment très longue ici`.slice(0, 40).padEnd(40, "x"),
);

export async function seedExtreme(): Promise<Seeded> {
  // Le joueur principal : pseudo de 20 caractères, super-admin, dans 10 ligues.
  const x = await account("WWWWWWWWWWWWWWWWWWWW", "extreme@ecrans.invalid");
  await getDb().update(users).set({ isSuperAdmin: true }).where(eq(users.id, x.id));

  const main = await league(x, "Ligue_Des_Incorrigibles_Du_Bar");
  const inviteCode = await codeOf(main);

  // 49 autres membres : ligue pleine.
  const others = [];
  for (let i = 1; i <= 49; i++) {
    const u = await filler(longName(i));
    await joinLeague(u, inviteCode, new Date());
    others.push(u);
  }
  const [y, z, w] = [others[0]!, others[1]!, others[2]!];

  // Solde à cinq chiffres ; de quoi miser gros pour les autres.
  await credit(main, x.id, 12_000);
  await credit(main, y.id, 9_000);
  await credit(main, z.id, 9_000);
  for (const u of others.slice(3)) await credit(main, u.id, 1 + Math.floor(Math.random() * 3000));

  // Pari réglé : gain à quatre chiffres pour X, bilan négatif à quatre chiffres pour Y.
  const settled = await bet(x, main, QUESTION, OPTIONS, minutes(-240), minutes(-180));
  await stake(x, main, settled.id, settled.options[0]!, 2_500, minutes(-239));
  await stake(y, main, settled.id, settled.options[1]!, 4_321, minutes(-239));
  await stake(z, main, settled.id, settled.options[2]!, 2_000, minutes(-239));
  await resolveBet(x, main, settled.id, { optionId: settled.options[0]! }, minutes(-170));
  await settleDue(main, new Date());

  // Résultat saisi, en attente de versement.
  const resolved = await bet(
    x,
    main,
    variant("Résultat saisi"),
    OPTIONS,
    minutes(-60),
    minutes(-30),
  );
  await stake(x, main, resolved.id, resolved.options[7]!, 1_234, minutes(-59));
  await stake(w, main, resolved.id, resolved.options[0]!, 10, minutes(-59));
  await resolveBet(x, main, resolved.id, { optionId: resolved.options[7]! }, minutes(-1));

  // Fermé, sans résultat.
  const closed = await bet(x, main, variant("Fermé"), OPTIONS, minutes(-60), minutes(-10));
  await stake(y, main, closed.id, closed.options[3]!, 999, minutes(-59));

  // Ouvert : 140 caractères, 8 options de 40, une mise de X.
  const open = await bet(x, main, QUESTION, OPTIONS, new Date(), minutes(2 * 24 * 60));
  await stake(x, main, open.id, open.options[4]!, 1_111, new Date());
  await stake(z, main, open.id, open.options[5]!, 2_222, new Date());

  // Programmé, mystère.
  const scheduled = await bet(x, main, QUESTION, OPTIONS, new Date(), minutes(3 * 24 * 60), {
    opensAt: minutes(24 * 60).toISOString(),
    hiddenUntilOpen: true,
  });

  // Annulé.
  const cancelled = await bet(
    x,
    main,
    "Pari annulé avec une question assez longue pour deux lignes ?",
    ["Oui", "Non"],
    new Date(),
    minutes(600),
  );
  await cancelBet(x, main, cancelled.id, new Date());

  // Chat : 500 caractères sans espace, puis avec ; une mention de X.
  await sendMessage(x, main, { kind: "text", body: "W".repeat(500) }, minutes(1));
  await sendMessage(y, main, { kind: "text", body: "mot ".repeat(125).trim() }, minutes(2));
  await sendMessage(
    z,
    main,
    { kind: "text", body: `@${x.name} regarde ce pari incroyable` },
    minutes(3),
  );

  // Stickers (docs/STICKERS.md) : un très haut chez un autre, avec 500 caractères
  // sans espace dessous ; un très large chez X, sans texte ; un minuscule.
  const sticker = (width: number, height: number) =>
    sharp({ create: { width, height, channels: 4, background: "#f2b632" } })
      .png()
      .toBuffer();
  await sendSticker(y, main, await sticker(300, 1200), "W".repeat(500), minutes(4));
  await sendSticker(x, main, await sticker(1600, 200), "", minutes(5));
  await sendSticker(z, main, await sticker(12, 12), "", minutes(6));

  // Une bordure portée.
  const [border] = await getDb().select().from(cosmetics).where(eq(cosmetics.name, "Nuit"));
  if (border) await purchase(x, main, border.id, new Date());

  // X dans 10 ligues au total.
  for (let i = 1; i <= 9; i++) {
    const owner = others[i + 2]!;
    const id = await league(owner, longLeague(i));
    await joinLeague(x, await codeOf(id), new Date());
  }

  // Le compte vide : seul dans sa ligue, aucune activité.
  const v = await account("VideVideVideVideVide", "vide@ecrans.invalid");
  const empty = await league(v, "Ligue_Vide_Sans_Rien_Du_Tout_X");

  return {
    full: { email: "extreme@ecrans.invalid", leagueId: main, inviteCode },
    empty: { email: "vide@ecrans.invalid", leagueId: empty },
    bets: {
      open: open.id,
      closed: closed.id,
      resolved: resolved.id,
      settled: settled.id,
      scheduled: scheduled.id,
    },
  };
}
