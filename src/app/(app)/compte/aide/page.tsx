import type { Metadata } from "next";
import { ListGroup, ListRow, SectionTitle } from "@/components/List";
import { Screen } from "@/components/Screen";
import { ScreenHeader } from "@/components/ScreenHeader";
import { APP_VERSION } from "@/lib/version";
import { isUuid, requireUser } from "@/server/auth";

export const metadata: Metadata = { title: "Aide et légal · JentApp" };

export default async function HelpPage({ searchParams }: PageProps<"/compte/aide">) {
  await requireUser("/compte/aide");
  const { ligue } = await searchParams;
  const back = typeof ligue === "string" && isUuid(ligue) ? `/compte?ligue=${ligue}` : "/compte";

  return (
    <Screen>
      <ScreenHeader back={back} title="Aide et légal" />
      <main className="flex grow flex-col gap-4 px-5 pt-2 pb-6">
        <SectionTitle>AIDE</SectionTitle>
        <ListGroup>
          <ListRow
            label="Revoir la présentation"
            href={`/bienvenue/presentation?suite=${encodeURIComponent(back)}`}
          />
          <ListRow label="Installer l'app" href={`/installer?suite=${encodeURIComponent(back)}`} />
          <ListRow label="Nouveautés" href="/nouveautes" />
        </ListGroup>
        <SectionTitle>LÉGAL</SectionTitle>
        <ListGroup>
          <ListRow label="Conditions d'utilisation" href="/conditions" />
          <ListRow label="Politique de confidentialité" href="/confidentialite" />
          <ListRow label="Mentions légales" href="/mentions-legales" />
        </ListGroup>
        <SectionTitle>COMPTE</SectionTitle>
        <ListGroup>
          <ListRow label="Supprimer mon compte" tone="loss" href="/compte/supprimer" />
        </ListGroup>
        <div className="grow" />
        <p className="text-caption text-ink-subtle">JentApp {APP_VERSION}</p>
      </main>
    </Screen>
  );
}
