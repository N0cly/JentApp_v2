import { Screen } from "@/components/Screen";
import { ScreenHeader } from "@/components/ScreenHeader";
import { readLegalPage, type LegalPage } from "@/server/legal";

/** Lisible sans compte. Le retour mène à Aide et légal (ou à la connexion). */
export async function LegalScreen({ page }: { page: LegalPage }) {
  const { title, html } = await readLegalPage(page);
  return (
    <Screen>
      <ScreenHeader back="/compte/aide" title={title} />
      <main
        className="flex grow flex-col gap-2 px-5 pt-2 pb-6 [&>p:first-child]:text-caption [&>p:first-child]:text-ink-subtle"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </Screen>
  );
}
