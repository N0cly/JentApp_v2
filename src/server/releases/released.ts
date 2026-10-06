// Date de mise en ligne (docs/NOUVEAUTES.md, § Date) : celle du fichier si elle
// y figure, sinon celle du premier démarrage de la version dans cet
// environnement, notée par l'annonce automatique.

import { getDb } from "@/db/client";
import { releases } from "@/db/schema";
import type { Release } from "./notes";

/** Jour du calendrier à Paris, « AAAA-MM-JJ ». */
export function parisDay(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Chaque note avec sa date : le fichier l'emporte ; sans l'un ni l'autre, pas de date. */
export async function withReleaseDates(notes: Release[]): Promise<Release[]> {
  const rows = await getDb().select().from(releases);
  const started = new Map(rows.map((r) => [r.version, parisDay(r.releasedAt)]));
  return notes.map((note) => ({ ...note, date: note.date ?? started.get(note.version) ?? null }));
}
