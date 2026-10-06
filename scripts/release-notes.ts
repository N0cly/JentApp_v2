// Notes à annoncer lors d'une promotion (docs/NOUVEAUTES.md, § Promotion),
// lancé par promote.sh dans l'image validée, sans base de données.
// Usage : node scripts/release-notes.ts [--after x.y.z] <version>
//   Les notes des versions plus récentes que --after, jusqu'à <version>, la
//   plus récente d'abord, puis le texte du push de <version>, le seul envoyé.
//   Sans --after : la note de <version> seule.
//         node scripts/release-notes.ts --title <version>
//   Le titre de <version>, pour le message Telegram.
//         node scripts/release-notes.ts --silent <version>
//   « oui » si la note de <version> dit « push: aucun », sinon « non ».
import { compareVersions, isVersion } from "../src/lib/semver.ts";
import { listReleases } from "../src/server/releases/notes.ts";
import { pushLine, releaseForTerminal } from "../src/server/releases/terminal.ts";

const usage =
  "Usage : release-notes.ts [--after x.y.z] <version> | --title <version> | --silent <version>";
const stop = (message: string): never => {
  console.error(message);
  process.exit(1);
};

const args = process.argv.slice(2);
let after: string | null = null;
let titleOnly = false;
let silentOnly = false;
let version: string | null = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--after" && args[i + 1]) after = args[++i]!;
  else if (args[i] === "--title") titleOnly = true;
  else if (args[i] === "--silent") silentOnly = true;
  else if (!version) version = args[i]!;
  else stop(usage);
}
if (!version || !isVersion(version) || (after !== null && !isVersion(after))) stop(usage);

const releases = await listReleases();
const target = releases.find((r) => r.version === version);
if (!target) stop(`Pas de note pour la version ${version} dans content/releases.`);

if (titleOnly) {
  console.log(target!.title);
} else if (silentOnly) {
  console.log(target!.silent ? "oui" : "non");
} else {
  const shown = releases.filter(
    (r) =>
      compareVersions(r.version, version!) <= 0 &&
      (after === null ? r.version === version : compareVersions(r.version, after) > 0),
  );
  console.log(shown.map((r) => releaseForTerminal(r, { push: false })).join("\n\n"));
  console.log("");
  console.log(pushLine(target!));
}
