// Journal de la ligue (docs/M7.md, § Journal) : lecture d'audit_log, lisible
// par tous les membres actifs, 50 par page.

import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import { auditLog, betOptions, bets, users } from "@/db/schema";
import { isUuid, memberOrNotFound } from "@/server/auth/access";
import { DELETED_PLAYER } from "@/server/leagues";
import { frenchSpacing } from "@/lib/typo";

export const JOURNAL_PAGE_SIZE = 50;

export type JournalEntry = {
  id: string;
  createdAt: Date;
  /** L'auteur, en gras devant la phrase ; vide pour une action automatique. */
  actor: string | null;
  text: string;
};

const settingLabels: Record<string, string> = {
  joinGrant: "la dotation de départ",
  weeklyGrant: "l'allocation hebdomadaire",
  seedAmount: "la cagnotte par pari",
};

type Details = Record<string, unknown>;
type Lookup = {
  names: Map<string, string>;
  bets: Map<string, { question: string; hiddenUntilOpen: boolean; opensAt: Date }>;
  options: Map<string, string>;
};

const quoted = (text: string) => `« ${frenchSpacing(text)} »`;
const str = (value: unknown) => (typeof value === "string" ? value : "");

/** La phrase d'une ligne du journal. Pure, une fois les noms résolus. */
export function journalSentence(
  action: string,
  details: Details,
  lookup: Lookup,
  now: Date,
): string {
  const bet = lookup.bets.get(str(details.betId));
  const question = bet ? quoted(bet.question) : "";
  const option = lookup.options.get(str(details.optionId)) ?? "";
  const name = (key: string) => lookup.names.get(str(details[key])) ?? DELETED_PLAYER;
  switch (action) {
    case "bet.created":
      // Un mystère pas encore ouvert ne livre pas sa question.
      if (bet?.hiddenUntilOpen && now < bet.opensAt) return "a créé un pari mystère";
      return `a créé le pari ${question}`;
    case "bet.resolved":
      return `a saisi le résultat de ${question} : ${option}`;
    case "bet.corrected":
      return `a corrigé le résultat de ${question} : ${option}`;
    case "bet.cancelled":
      if (details.reason === "expired")
        return `Le pari ${question} est annulé, sans résultat depuis 7 jours`;
      if (details.reason === "tie") return `a annulé le pari ${question} : égalité`;
      return `a annulé le pari ${question}`;
    case "round.offered":
      return `a offert une tournée générale : +${Number(details.amount) || 0} pour tous`;
    case "settings.changed": {
      const [key, change] = Object.entries(details)[0] ?? [];
      const { from, to } = (change ?? {}) as { from?: unknown; to?: unknown };
      if (key === "name") return `a renommé la ligue en ${quoted(String(to ?? ""))}`;
      return `a passé ${settingLabels[key ?? ""] ?? key} de ${from} à ${to}`;
    }
    case "role.changed":
      return details.to === "admin"
        ? `a nommé ${name("userId")} admin`
        : `a retiré le rôle d'admin à ${name("userId")}`;
    case "member.removed":
      return `a exclu ${name("userId")}`;
    case "invite.regenerated":
      return "a régénéré le code d'invitation";
    case "league.transferred":
      return `a transmis la ligue à ${name("to")}`;
    default:
      return action;
  }
}

/** Le journal, page par page (à partir de 0), du plus récent au plus ancien. */
export async function readJournal(
  actor: { id: string },
  leagueId: string,
  page: number,
  now: Date,
): Promise<{ items: JournalEntry[]; hasMore: boolean }> {
  await memberOrNotFound(actor.id, leagueId);
  const safePage = Number.isInteger(page) && page >= 0 ? page : 0;
  const rows = await getDb()
    .select()
    .from(auditLog)
    .where(eq(auditLog.leagueId, leagueId))
    .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
    .limit(JOURNAL_PAGE_SIZE + 1)
    .offset(safePage * JOURNAL_PAGE_SIZE);
  const page_ = rows.slice(0, JOURNAL_PAGE_SIZE);

  const details = page_.map((r) => (r.details ?? {}) as Details);
  const userIds = new Set<string>();
  const betIds = new Set<string>();
  const optionIds = new Set<string>();
  page_.forEach((r, i) => {
    if (r.actorId) userIds.add(r.actorId);
    const d = details[i]!;
    for (const key of ["userId", "to"]) if (isUuid(str(d[key]))) userIds.add(str(d[key]));
    if (isUuid(str(d.betId))) betIds.add(str(d.betId));
    if (isUuid(str(d.optionId))) optionIds.add(str(d.optionId));
  });
  const [names, betRows, optionRows] = await Promise.all([
    userIds.size
      ? getDb()
          .select({ id: users.id, name: users.name })
          .from(users)
          .where(inArray(users.id, [...userIds]))
      : [],
    betIds.size
      ? getDb()
          .select({
            id: bets.id,
            question: bets.question,
            hiddenUntilOpen: bets.hiddenUntilOpen,
            opensAt: bets.opensAt,
          })
          .from(bets)
          .where(and(eq(bets.leagueId, leagueId), inArray(bets.id, [...betIds])))
      : [],
    optionIds.size
      ? getDb()
          .select({ id: betOptions.id, label: betOptions.label })
          .from(betOptions)
          .where(inArray(betOptions.id, [...optionIds]))
      : [],
  ]);
  const lookup: Lookup = {
    names: new Map(names.map((n) => [n.id, n.name ?? DELETED_PLAYER])),
    bets: new Map(betRows.map((b) => [b.id, b])),
    options: new Map(optionRows.map((o) => [o.id, o.label])),
  };

  return {
    items: page_.map((r, i) => ({
      id: r.id,
      createdAt: r.createdAt,
      actor: r.actorId ? (lookup.names.get(r.actorId) ?? DELETED_PLAYER) : null,
      text: journalSentence(r.action, details[i]!, lookup, now),
    })),
    hasMore: rows.length > JOURNAL_PAGE_SIZE,
  };
}
