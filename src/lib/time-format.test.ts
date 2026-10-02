import { describe, expect, it } from "vitest";
import { atTime } from "./time-format";

describe("atTime", () => {
  const now = new Date("2026-10-07T18:00:00Z");
  it("aujourd'hui : l'heure seule, dans le fuseau donné", () => {
    expect(atTime(new Date("2026-10-07T21:30:00Z"), now, "Europe/Paris")).toBe("à 23:30");
    expect(atTime(new Date("2026-10-07T21:30:00Z"), now, "America/New_York")).toBe("à 17:30");
  });
  it("un autre jour : la date et l'heure", () => {
    expect(atTime(new Date("2026-10-12T21:30:00Z"), now, "Europe/Paris")).toBe("le 12/10 à 23:30");
    // Minuit passé à Paris : déjà le lendemain.
    expect(atTime(new Date("2026-10-07T22:30:00Z"), now, "Europe/Paris")).toBe("le 08/10 à 00:30");
  });
});
