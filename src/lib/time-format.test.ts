import { describe, expect, it } from "vitest";
import { atTime, shortWhen } from "./time-format";

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

describe("dayLabel", () => {
  const now = new Date("2026-10-07T18:00:00Z");
  const tz = "Europe/Paris";
  it("aujourd'hui, hier, puis le jour et la date", async () => {
    const { dayLabel, clockTime } = await import("./time-format");
    expect(dayLabel(new Date("2026-10-07T06:00:00Z"), now, tz)).toBe("AUJOURD'HUI");
    expect(dayLabel(new Date("2026-10-06T21:00:00Z"), now, tz)).toBe("HIER");
    expect(dayLabel(new Date("2026-10-05T12:00:00Z"), now, tz)).toBe("LUNDI 5 OCTOBRE");
    expect(dayLabel(new Date("2025-12-31T12:00:00Z"), now, tz)).toBe("MERCREDI 31 DÉCEMBRE 2025");
    expect(clockTime(new Date("2026-10-07T19:14:00Z"), tz)).toBe("21:14");
  });
});

describe("heure d'une notification", () => {
  const now = new Date("2026-10-07T18:00:00Z");
  it("aujourd'hui l'heure, hier « HIER », puis le jour et le mois", () => {
    expect(shortWhen(new Date("2026-10-07T19:14:00Z"), now, "Europe/Paris")).toBe("21:14");
    expect(shortWhen(new Date("2026-10-06T19:14:00Z"), now, "Europe/Paris")).toBe("HIER");
    expect(shortWhen(new Date("2026-10-05T10:00:00Z"), now, "Europe/Paris")).toBe("5 OCT.");
  });
});
