// Annonce à tous les joueurs (docs/ANNONCE.md) : jamais depuis l'interface.
// Sans --envoyer, c'est un aperçu : rien n'est écrit.
// Usage : pnpm announce [--envoyer] "<message>"
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import {
  announcementMessage,
  announcementReach,
  AnnouncementError,
  sendAnnouncement,
  type AnnouncementReach,
} from "../src/server/notifications/announce.ts";

const usage = 'Usage : announce.ts [--envoyer] "<message>"';
const args = process.argv.slice(2);
const send = args.includes("--envoyer");
const rest = args.filter((a) => a !== "--envoyer");
const url = process.env.DATABASE_URL;
if (rest.length !== 1) {
  console.error(usage);
  process.exit(1);
}
if (!url) {
  console.error("DATABASE_URL manquante");
  process.exit(1);
}

let message: string;
try {
  message = announcementMessage(rest[0]);
} catch (error) {
  if (!(error instanceof AnnouncementError)) throw error;
  console.error(error.message);
  process.exit(1);
}

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`;
const reachText = (r: AnnouncementReach) =>
  `${plural(r.accounts, "compte")}, dont ${plural(r.pushSubscribers, "abonné")} au push`;

const client = postgres(url, { max: 1, onnotice: () => {} });
try {
  const db = drizzle(client);
  if (send) {
    const reach = await sendAnnouncement(db, message);
    console.log(`Annonce envoyée à ${reachText(reach)}.`);
  } else {
    const reach = await announcementReach(db);
    console.log(`Aperçu, rien n'est envoyé.`);
    console.log(`Message : « ${message} »`);
    console.log(`Destinataires : ${reachText(reach)}.`);
    console.log("Pour envoyer : ajoute --envoyer.");
  }
} finally {
  await client.end();
}
