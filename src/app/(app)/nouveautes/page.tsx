import type { Metadata } from "next";
import { ReleaseBody } from "@/components/releases/ReleaseBody";
import { Screen } from "@/components/Screen";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Card } from "@/components/ui";
import { frenchSpacing } from "@/lib/typo";
import { requireUser } from "@/server/auth";
import { listReleases, releaseDate } from "@/server/releases";

export const metadata: Metadata = { title: "Nouveautés · JentApp" };

/** Toutes les versions, la plus récente d'abord (docs/VALIDATION.md, B.6). */
export default async function ReleasesPage() {
  await requireUser("/nouveautes");
  const releases = await listReleases();
  return (
    <Screen>
      <ScreenHeader back="/compte/aide" title="Nouveautés" />
      <main className="flex grow flex-col gap-3 px-5 pt-2 pb-6">
        {releases.map((release) => (
          <Card key={release.version}>
            <div className="flex flex-col gap-1">
              <p className="text-overline text-ink-subtle">
                {release.date ? `${release.version} · ${releaseDate(release.date)}` : release.version}
              </p>
              <h2 className="text-[20px] leading-6 font-bold [overflow-wrap:anywhere]">
                {frenchSpacing(release.title)}
              </h2>
            </div>
            <ReleaseBody release={release} />
          </Card>
        ))}
      </main>
    </Screen>
  );
}
