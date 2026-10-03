import type { ErrorEvent } from "@sentry/nextjs";
import { describe, expect, it } from "vitest";
import { scrubEvent } from "./error-report";

const event = (over: Partial<ErrorEvent> = {}): ErrorEvent =>
  ({
    type: undefined,
    message: undefined,
    exception: { values: [{ type: "Error", value: "Échec pour hugo@exemple.fr" }] },
    request: {
      url: "https://jentapp.nocly.fr/nouveau-mot-de-passe?token=secret",
      method: "POST",
      cookies: { "better-auth.session_token": "abc" },
      headers: { cookie: "x=1", "user-agent": "Safari" },
      data: '{"email":"hugo@exemple.fr"}',
      query_string: "token=secret",
    },
    user: { id: "u-1", email: "hugo@exemple.fr", ip_address: "1.2.3.4", username: "Hugo" },
    breadcrumbs: [{ message: "console hugo@exemple.fr" }],
    extra: { body: "x" },
    ...over,
  }) as ErrorEvent;

describe("suivi d'erreurs", () => {
  it("ni email, ni cookie, ni corps, ni paramètre d'URL ; l'identifiant du joueur seul", () => {
    const out = scrubEvent(event())!;
    expect(out.request).toEqual({
      url: "https://jentapp.nocly.fr/nouveau-mot-de-passe",
      method: "POST",
    });
    expect(out.user).toEqual({ id: "u-1" });
    expect(out.breadcrumbs).toBeUndefined();
    expect(out.extra).toBeUndefined();
    expect(out.exception!.values![0]!.value).toBe("Échec pour [email]");
    const json = JSON.stringify(out);
    for (const leak of ["hugo@exemple.fr", "abc", "secret", "1.2.3.4", "Hugo", "cookie"]) {
      expect(json).not.toContain(leak);
    }
  });

  it("les interruptions du client ne remontent pas", () => {
    const abort = event({
      exception: { values: [{ type: "Error", value: "The destination stream closed early." }] },
    });
    expect(scrubEvent(abort)).toBeNull();
  });
});
