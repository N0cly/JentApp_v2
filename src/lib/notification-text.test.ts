import { describe, expect, it } from "vitest";
import { notificationHref, notificationTag, notificationText } from "./notification-text";

const now = new Date("2026-10-07T18:00:00Z");
const PARIS = "Europe/Paris";

describe("phrase d'une notification", () => {
  it("chaque type, au texte du tableau", () => {
    const t = (p: Parameters<typeof notificationText>[0]) => notificationText(p, now, PARIS);
    expect(t({ type: "bet_opened", betId: "b", question: "Qui paie ?", opensAt: null })).toBe(
      "Nouveau pari : Qui paie ?",
    );
    expect(
      t({
        type: "bet_opened",
        betId: "b",
        question: "Qui paie ?",
        opensAt: "2026-10-07T21:30:00Z",
      }),
    ).toBe("Pari programmé, ouverture à 23:30 : Qui paie ?");
    expect(
      t({ type: "bet_opened", betId: "b", question: null, opensAt: "2026-10-12T21:30:00Z" }),
    ).toBe("Pari mystère programmé. Ouverture le 12/10 à 23:30.");
    expect(
      t({
        type: "bet_resolved",
        betId: "b",
        question: "Q ?",
        option: "Non",
        delayMinutes: 10,
        correction: false,
      }),
    ).toBe("Résultat saisi sur « Q ? » : Non. Versement dans 10 minutes.");
    expect(
      t({
        type: "bet_resolved",
        betId: "b",
        question: "Q",
        option: "Oui",
        delayMinutes: 1,
        correction: true,
      }),
    ).toBe("Résultat corrigé sur « Q » : Oui. Versement dans 1 minute.");
    expect(t({ type: "bet_settled", betId: "b", question: "Q", outcome: "won", amount: 19 })).toBe(
      "Pari réglé : tu gagnes 19 clopes sur « Q »",
    );
    expect(t({ type: "bet_settled", betId: "b", question: "Q", outcome: "lost", amount: 8 })).toBe(
      "Pari réglé : tu perds 8 clopes sur « Q »",
    );
    expect(
      t({ type: "bet_settled", betId: "b", question: "Q", outcome: "refunded", amount: 4 }),
    ).toBe("Pari réglé : ta mise de 4 est rendue sur « Q »");
    expect(t({ type: "bet_cancelled", betId: "b", question: "Q", amount: 3 })).toBe(
      "Pari annulé : « Q ». Ta mise de 3 est rendue.",
    );
    expect(t({ type: "mention", messageId: 4, author: "Paco" })).toBe(
      "Paco t'a mentionné dans le chat",
    );
    expect(t({ type: "round", amount: 10 })).toBe(
      "Tournée générale : +10 clopes pour tout le monde",
    );
  });

  it("lien et étiquette", () => {
    expect(notificationHref("L", { type: "mention", messageId: 4, author: "P" })).toBe(
      "/l/L/chat?message=4",
    );
    expect(
      notificationHref("L", { type: "bet_cancelled", betId: "B", question: "Q", amount: 1 }),
    ).toBe("/l/L/paris/B");
    expect(notificationTag({ type: "bet_cancelled", betId: "B", question: "Q", amount: 1 })).toBe(
      "bet:B",
    );
    expect(notificationTag({ type: "round", amount: 1 })).toBeNull();
  });
});
