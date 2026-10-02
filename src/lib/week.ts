// Semaines à l'heure de Paris, sans dépendance : Intl suffit.

const ZONE = "Europe/Paris";

const formatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  weekday: "short",
  hourCycle: "h23",
});

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function parisParts(date: Date) {
  const parts = Object.fromEntries(formatter.formatToParts(date).map((p) => [p.type, p.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    /** 0 pour lundi, 6 pour dimanche. */
    weekday: WEEKDAYS.indexOf(parts.weekday ?? ""),
  };
}

/** Écart entre l'heure de Paris et UTC à cet instant, en millisecondes. */
function parisOffset(date: Date): number {
  const p = parisParts(date);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** Instant de minuit, heure de Paris, pour une date du calendrier. */
function parisMidnight(year: number, month: number, day: number): Date {
  const utc = Date.UTC(year, month - 1, day);
  // Deux passes : le décalage dépend de l'instant (heure d'été ou non).
  const first = utc - parisOffset(new Date(utc));
  return new Date(utc - parisOffset(new Date(first)));
}

/** Lundi 00:00, heure de Paris, de la semaine qui contient `now`. */
export function weekStart(now: Date): Date {
  const p = parisParts(now);
  const monday = new Date(Date.UTC(p.year, p.month - 1, p.day - p.weekday));
  return parisMidnight(monday.getUTCFullYear(), monday.getUTCMonth() + 1, monday.getUTCDate());
}

/** Lundi de la semaine qui contient `now`, au format AAAA-MM-JJ (calendrier de Paris). */
export function weekKey(now: Date): string {
  const p = parisParts(now);
  const monday = new Date(Date.UTC(p.year, p.month - 1, p.day - p.weekday));
  return monday.toISOString().slice(0, 10);
}
