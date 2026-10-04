import { describe, expect, it } from "vitest";
import { appEnv, isValidation } from "./env";

describe("APP_ENV", () => {
  it("absent ou vide : production", () => {
    expect(appEnv({})).toBe("production");
    expect(appEnv({ APP_ENV: "  " })).toBe("production");
    expect(isValidation({})).toBe(false);
  });

  it("production ou validation", () => {
    expect(appEnv({ APP_ENV: "production" })).toBe("production");
    expect(appEnv({ APP_ENV: "validation" })).toBe("validation");
    expect(isValidation({ APP_ENV: "validation" })).toBe(true);
  });

  it("une autre valeur : erreur", () => {
    expect(() => appEnv({ APP_ENV: "staging" })).toThrow(/APP_ENV/);
  });

  it("lu à l'exécution", () => {
    const before = process.env.APP_ENV;
    process.env.APP_ENV = "validation";
    expect(appEnv()).toBe("validation");
    if (before === undefined) delete process.env.APP_ENV;
    else process.env.APP_ENV = before;
  });
});
