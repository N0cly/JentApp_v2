/** Ressource absente, ou qu'on ne doit pas révéler : rendue en 404. */
export class NotFoundError extends Error {
  readonly status = 404;
  constructor() {
    super("Introuvable");
  }
}
