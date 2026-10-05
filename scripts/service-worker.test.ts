import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

// docs/STICKERS.md, § Accès : le service worker ne met pas les stickers en
// cache. public/sw.js est chargé dans un faux contexte de service worker.
function loadWorker() {
  const handlers = new Map<string, (event: unknown) => void>();
  const self = {
    location: { href: "https://jentapp.test/sw.js?v=test", origin: "https://jentapp.test" },
    addEventListener: (type: string, handler: (event: unknown) => void) =>
      handlers.set(type, handler),
  };
  const caches = { open: vi.fn(() => new Promise(() => {})), match: vi.fn(), keys: vi.fn() };
  new Function("self", "caches", "fetch", readFileSync("public/sw.js", "utf8"))(
    self,
    caches,
    vi.fn(),
  );
  return { fetch: handlers.get("fetch")!, caches };
}

function request(path: string, mode = "no-cors") {
  const respondWith = vi.fn();
  return {
    event: {
      request: { method: "GET", url: `https://jentapp.test${path}`, mode },
      respondWith,
    },
    respondWith,
  };
}

describe("service worker", () => {
  it("ne touche pas aux stickers : ni cache, ni réponse détournée", () => {
    const { fetch, caches } = loadWorker();
    const { event, respondWith } = request(
      `/api/l/6c1f0e2a-3b4d-4e5f-8a9b-0c1d2e3f4a5b/stickers/${"a".repeat(64)}`,
    );
    fetch(event);
    expect(respondWith).not.toHaveBeenCalled();
    expect(caches.open).not.toHaveBeenCalled();
  });

  it("garde les fichiers du build en cache", () => {
    const { fetch } = loadWorker();
    const { event, respondWith } = request("/_next/static/chunks/app.js");
    fetch(event);
    expect(respondWith).toHaveBeenCalled();
  });
});
