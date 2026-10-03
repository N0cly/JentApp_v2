// Service worker de JentApp (docs/M7.md, § Service worker), écrit à la main.
// Il affiche le push, garde la page hors ligne et les fichiers statiques du
// build, rien d'autre : jamais une page d'un joueur, jamais /api/.

const VERSION = new URL(self.location.href).searchParams.get("v") || "dev";
const CACHE = `jentapp-${VERSION}`;
const OFFLINE = "/hors-ligne";

/** La page hors ligne et les fichiers du build qu'elle charge. */
async function precache() {
  const cache = await caches.open(CACHE);
  const response = await fetch(new Request(OFFLINE, { cache: "reload" }));
  if (!response.ok) throw new Error("Page hors ligne indisponible");
  const html = await response.clone().text();
  await cache.put(OFFLINE, response);
  const assets = [...new Set(html.match(/\/_next\/static\/[^"'\s)]+/g) || [])];
  await Promise.all(assets.map((asset) => cache.add(asset).catch(() => undefined)));
}

self.addEventListener("install", (event) => {
  // Une nouvelle version s'active tout de suite.
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Fichiers du build : immuables, servis depuis le cache une fois vus.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      }),
    );
    return;
  }

  // Une navigation qui échoue affiche la page hors ligne ; le reste passe.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match(OFFLINE).then((page) => page || Response.error())),
    );
  }
});

self.addEventListener("push", (event) => {
  let message = {};
  try {
    message = event.data ? event.data.json() : {};
  } catch {
    message = { body: event.data ? event.data.text() : "" };
  }
  const options = {
    body: message.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { url: message.url || "/" },
    lang: "fr",
  };
  // Une étiquette par pari : une correction remplace la notification précédente.
  if (message.tag) Object.assign(options, { tag: message.tag, renotify: true });
  event.waitUntil(self.registration.showNotification(message.title || "JentApp", options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (windows) => {
      // L'onglet déjà ouvert revient au premier plan, sur la bonne page.
      const same = windows.find((w) => w.url === target);
      if (same) return same.focus();
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (open) {
        const focused = await open.focus();
        return focused.navigate(target);
      }
      return self.clients.openWindow(target);
    }),
  );
});
