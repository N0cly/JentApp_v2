import { isValidation } from "@/server/env";

/**
 * Bandeau fin « VALIDATION » en haut de chaque écran (docs/VALIDATION.md, A.5) :
 * impossible de confondre la validation avec la production. Rien en production.
 */
export function EnvBanner() {
  if (!isValidation()) return null;
  return (
    <div
      role="note"
      className="text-overline bg-brand pt-[env(safe-area-inset-top)] text-center text-on-brand"
    >
      <span className="block py-1">VALIDATION</span>
    </div>
  );
}
