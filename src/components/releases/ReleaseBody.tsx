import { boldParts } from "@/lib/release-text";
import { frenchSpacing } from "@/lib/typo";
import type { Release } from "@/server/releases";

/** Une ligne de note : texte brut, seul **gras** est interprété. */
function Line({ text }: { text: string }) {
  return boldParts(text).map((part, i) =>
    part.bold ? (
      <strong key={i} className="font-bold text-ink">
        {frenchSpacing(part.text)}
      </strong>
    ) : (
      frenchSpacing(part.text)
    ),
  );
}

/**
 * Corps d'une note (docs/NOUVEAUTES.md, § Feuille) : l'intro, puis chaque
 * rubrique avec son nom en sur-titre. Partagé par la feuille et la page.
 */
export function ReleaseBody({ release }: { release: Release }) {
  return (
    <div className="flex flex-col gap-3">
      {release.intro && <p className="text-body text-ink-muted">{frenchSpacing(release.intro)}</p>}
      {release.sections.map((section, i) => (
        <div key={i} className="flex flex-col gap-2">
          {section.heading && (
            <p className="text-overline text-ink-subtle">{frenchSpacing(section.heading)}</p>
          )}
          <ul className="text-body flex list-disc flex-col gap-2 pl-5 text-ink-muted">
            {section.items.map((item) => (
              <li key={item}>
                <Line text={item} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
