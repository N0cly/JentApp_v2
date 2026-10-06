// Version de l'app (docs/VALIDATION.md, B.1) : celle de package.json, figée
// dans l'image au build. `2.x.0` pour une nouveauté visible, `2.x.y` pour une correction.
import pkg from "../../package.json";

export { compareVersions, isVersion } from "./semver";

export const APP_VERSION: string = pkg.version;
