// Numéro de version de develop (docs/DEPLOY.md, « Publier une version »), sur
// ton poste. Part de la version de origin/main, la production, après un
// git fetch. Ni commit ni push.
// Usage : pnpm release:bump <patch|minor|major>
//         pnpm release:set <X.Y.Z>
import {
  changeVersion,
  VersionChangeError,
  versionChangeText,
  type VersionRequest,
} from "../src/server/releases/version-change.ts";

const [command, value, ...rest] = process.argv.slice(2);
const usage = "Usage : pnpm release:bump <patch|minor|major> | pnpm release:set <X.Y.Z>";
let request: VersionRequest | null = null;
if (command === "bump" && value && rest.length === 0) request = { kind: "bump", level: value };
if (command === "set" && value && rest.length === 0) request = { kind: "set", version: value };
if (!request) {
  console.error(usage);
  process.exit(1);
}

try {
  console.log(versionChangeText(changeVersion(process.cwd(), request)));
} catch (error) {
  if (!(error instanceof VersionChangeError)) throw error;
  console.error(error.message);
  process.exitCode = 1;
}
