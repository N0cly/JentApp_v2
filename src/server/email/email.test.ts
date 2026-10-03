import { beforeEach, describe, expect, it } from "vitest";
import { confirmationEmail, outbox, resetPasswordEmail, sendEmail } from ".";

const link = "http://localhost:3000/api/auth/verify-email?token=abc&callbackURL=%2F";

describe("emails", () => {
  beforeEach(() => {
    outbox.length = 0;
  });

  it("confirmation : objet, texte brut et lien", () => {
    const email = confirmationEmail({ pseudo: "Nocly", link });
    expect(email.subject).toBe("Confirme ton email JentApp");
    expect(email.text).toBe(
      `Salut Nocly,\n\nConfirme ton email pour sécuriser ton compte JentApp :\n\n${link}\n\nLe lien est valable 24 heures. Si tu n'as pas créé de compte, ignore ce message.\n`,
    );
    expect(email.html).toContain(`<a href="${link.replaceAll("&", "&amp;")}">`);
  });

  it("réinitialisation : objet et durée du lien", () => {
    const email = resetPasswordEmail({ pseudo: "Nocly", link });
    expect(email.subject).toBe("Choisis un nouveau mot de passe JentApp");
    expect(email.text).toContain("Le lien est valable 1 heure et ne sert qu'une fois.");
  });

  it("échappe le pseudo dans le HTML", () => {
    const email = confirmationEmail({ pseudo: "<b>x</b>", link });
    expect(email.html).toContain("Salut &lt;b&gt;x&lt;/b&gt;,");
  });

  it("en test, envoie dans la boîte en mémoire", async () => {
    await sendEmail("a@exemple.fr", confirmationEmail({ pseudo: "A", link }));
    expect(outbox).toHaveLength(1);
    expect(outbox[0]?.to).toBe("a@exemple.fr");
  });
});
