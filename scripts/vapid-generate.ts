// Crée une paire de clés Web Push. Usage : pnpm vapid:generate
// Les copier dans .env (jamais dans le dépôt), avec VAPID_SUBJECT=mailto:…
import webpush from "web-push";

const { publicKey, privateKey } = webpush.generateVAPIDKeys();
console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${privateKey}`);
