// Aperçu des nouveautés sur la validation (docs/NOUVEAUTES.md, § Aperçu).
// Affiche la note telle que les joueurs la verront, réarme la feuille « Quoi
// de neuf » des comptes de VALIDATION_KEEP_EMAILS et, avec --push, leur
// renvoie la notification et le push. Refuse de tourner hors validation.
// Usage, dans le conteneur : node scripts/release-preview.ts [--push] [--version x.y.z]
import { readFileSync } from "node:fs";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { compareVersions, isVersion } from "../src/lib/semver.ts";
import { listReleases } from "../src/server/releases/notes.ts";
import { previewRelease, previousVersion } from "../src/server/releases/preview.ts";
import { releaseForTerminal } from "../src/server/releases/terminal.ts";
import {
  assertValidation,
  keepEmails,
  NotValidationError,
} from "../src/server/validation/scrub.ts";

const usage = "Usage : release-preview.ts [--push] [--version x.y.z]";
const stop = (message: string): never => {
  console.error(message);
  process.exit(1);
};

try {
  assertValidation();
} catch (error) {
  if (!(error instanceof NotValidationError)) throw error;
  stop(error.message);
}

const args = process.argv.slice(2);
let push = false;
let asked: string | null = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--push") push = true;
  else if (args[i] === "--version" && args[i + 1]) asked = args[++i]!;
  else stop(usage);
}

// Version courante de l'image : celle de son package.json.
const current = (JSON.parse(readFileSync("package.json", "utf8")) as { version: string }).version;
const version = asked ?? current;
if (!isVersion(version)) stop(`Version invalide : ${version}`);
if (compareVersions(version, current) > 0) {
  stop(
    `La version ${version} est plus récente que celle de l'image (${current}) : la feuille ne peut pas l'afficher.`,
  );
}
const releases = await listReleases();
const release = releases.find((r) => r.version === version);
if (!release) stop(`Pas de note pour la version ${version} dans content/releases.`);

const keep = keepEmails();
if (keep.length === 0) stop("VALIDATION_KEEP_EMAILS est vide : aucun compte à réarmer.");
const url = process.env.DATABASE_URL;
if (!url) stop("DATABASE_URL manquante");

console.log(releaseForTerminal(release!));
console.log("");

const previous = previousVersion(
  version,
  releases.map((r) => r.version),
);
const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`;
const client = postgres(url!, { max: 1, onnotice: () => {} });
try {
  const report = await previewRelease(drizzle(client), release!, previous, keep, { push });
  if (report.accounts === 0) {
    console.error(`Aucun compte gardé trouvé (${keep.join(", ")}) : rien n'est réarmé.`);
    process.exitCode = 1;
  } else {
    console.log(
      `Feuille réarmée pour ${plural(report.accounts, "compte gardé")} : elle se rouvre à la prochaine page (dernière version vue : ${previous}).`,
    );
    if (push) {
      console.log(
        `Notification recréée pour ${plural(report.notifications, "compte")}, l'app envoie le push à ${plural(report.pushSubscribers, "abonné")}.`,
      );
    } else {
      console.log("Pour renvoyer aussi le push : ajoute --push.");
    }
  }
} finally {
  await client.end();
}
