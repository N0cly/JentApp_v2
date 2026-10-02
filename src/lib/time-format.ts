// Heures affichées dans le fuseau de l'appareil (docs/M3.md, choix 9) :
// « à 23:30 » aujourd'hui, « le 12/10 à 23:30 » un autre jour.

function parts(date: Date, timeZone?: string) {
  const f = new Intl.DateTimeFormat("fr-FR", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  return Object.fromEntries(f.formatToParts(date).map((p) => [p.type, p.value]));
}

export function atTime(date: Date, now: Date, timeZone?: string): string {
  const d = parts(date, timeZone);
  const n = parts(now, timeZone);
  const time = `${d.hour}:${d.minute}`;
  const sameDay = d.year === n.year && d.month === n.month && d.day === n.day;
  return sameDay ? `à ${time}` : `le ${d.day}/${d.month} à ${time}`;
}

/** Valeur d'un champ datetime-local (heure de l'appareil). */
export function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
