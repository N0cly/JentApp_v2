/** Date d'une note, « 4 octobre 2026 » : un jour du calendrier, sans fuseau. */
export function releaseDate(date: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}
