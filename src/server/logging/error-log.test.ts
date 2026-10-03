import { describe, expect, it } from "vitest";
import { formatErrorLine } from "./error-log";

describe("journal des erreurs", () => {
  it("une ligne JSON : heure, route, joueur, message sans email", () => {
    const error = Object.assign(new Error("Échec pour hugo@exemple.fr"), { digest: "123" });
    const line = formatErrorLine(error, {
      route: "/l/[ligue]/paris",
      method: "GET",
      userId: "u-1",
      now: new Date("2026-10-07T18:00:00Z"),
    });
    expect(line).not.toContain("\n");
    const parsed = JSON.parse(line);
    expect(parsed).toMatchObject({
      time: "2026-10-07T18:00:00.000Z",
      level: "error",
      route: "/l/[ligue]/paris",
      method: "GET",
      user: "u-1",
      message: "Échec pour [email]",
      digest: "123",
    });
    expect(Array.isArray(parsed.stack)).toBe(true);
  });

  it("sans les paramètres d'une requête SQL en échec", () => {
    const error = new Error(
      'Failed query: select * from "sessions" where token = $1\nparams: jeton-secret',
    );
    const line = formatErrorLine(error, {
      route: null,
      method: null,
      userId: null,
      now: new Date(),
    });
    expect(line).not.toContain("jeton-secret");
    expect(JSON.parse(line).message).toBe(
      'Failed query: select * from "sessions" where token = $1',
    );
  });
});
