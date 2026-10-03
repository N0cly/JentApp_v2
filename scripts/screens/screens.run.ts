// `pnpm test:screens` (docs/ECRANS.md, § Méthode) : chaque route de
// docs/design.md, à chaque taille, avec le jeu de données extrême. Échoue si
// la page défile en largeur, si un élément dépasse du bord droit, si une zone
// d'appui fait moins de 44 px, ou si la colonne n'est pas centrée sur grand
// écran. Une capture par écran et par taille dans screens-output/.

import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { PASSWORD } from "./seed";
import { BASE, OUTPUT } from "./setup";

const SIZES = [
  [320, 568],
  [360, 740],
  [375, 667],
  [390, 844],
  [412, 915],
  [430, 932],
  [820, 1180],
] as const;

type Account = "full" | "empty" | "none";
type Route = { name: string; path: string; as: Account; open?: (page: Page) => Promise<void> };

const seeded = inject("seeded");
const L = seeded.full.leagueId;
const E = seeded.empty.leagueId;
const b = seeded.bets;

/** Ouvre une feuille en appuyant sur le premier élément qui correspond. */
const tap = (selector: string) => async (page: Page) => {
  await page.locator(selector).first().click();
  await page.waitForTimeout(600);
};

const ROUTES: Route[] = [
  { name: "connexion", path: "/connexion", as: "none" },
  { name: "inscription", path: "/inscription", as: "none" },
  { name: "mot-de-passe-oublie", path: "/mot-de-passe-oublie", as: "none" },
  { name: "nouveau-mot-de-passe", path: "/nouveau-mot-de-passe?token=x", as: "none" },
  { name: "conditions", path: "/conditions", as: "none" },
  { name: "confidentialite", path: "/confidentialite", as: "none" },
  { name: "mentions-legales", path: "/mentions-legales", as: "none" },
  { name: "hors-ligne", path: "/hors-ligne", as: "none" },
  { name: "introuvable", path: "/n-existe-pas", as: "full" },
  { name: "compte", path: `/compte?ligue=${L}`, as: "full" },
  { name: "compte-aide", path: "/compte/aide", as: "full" },
  { name: "compte-supprimer", path: "/compte/supprimer", as: "full" },
  { name: "bienvenue", path: "/bienvenue", as: "full" },
  { name: "presentation-1", path: "/bienvenue/presentation?parcours=1", as: "full" },
  { name: "presentation-2", path: "/bienvenue/presentation?etape=2&parcours=1", as: "full" },
  { name: "presentation-3", path: "/bienvenue/presentation?etape=3&parcours=1", as: "full" },
  { name: "installer", path: "/installer?parcours=1", as: "full" },
  { name: "activer", path: "/notifications/activer?parcours=1", as: "full" },
  { name: "rejoindre", path: `/j/${seeded.full.inviteCode}`, as: "empty" },
  { name: "rejoindre-vide", path: "/j", as: "empty" },
  { name: "creer-ligue", path: "/ligues/nouvelle", as: "full" },
  { name: "notifications", path: "/notifications", as: "full" },
  { name: "notifications-vide", path: "/notifications", as: "empty" },
  { name: "catalogue", path: "/admin/catalogue", as: "full" },
  {
    name: "catalogue-formulaire",
    path: "/admin/catalogue",
    as: "full",
    open: tap("button:has-text('Ajouter un cosmétique')"),
  },
  { name: "paris", path: `/l/${L}/paris`, as: "full" },
  { name: "paris-vide", path: `/l/${E}/paris`, as: "empty" },
  {
    name: "ticket-de-mise",
    path: `/l/${L}/paris`,
    as: "full",
    open: tap("main button:has-text('Option numéro 1')"),
  },
  {
    name: "ligues",
    path: `/l/${L}/paris`,
    as: "full",
    open: tap("[aria-label^='Changer de ligue']"),
  },
  { name: "nouveau-pari", path: `/l/${L}/paris/nouveau`, as: "full" },
  { name: "pari-ouvert", path: `/l/${L}/paris/${b.open}`, as: "full" },
  { name: "pari-ferme", path: `/l/${L}/paris/${b.closed}`, as: "full" },
  { name: "pari-saisi", path: `/l/${L}/paris/${b.resolved}`, as: "full" },
  { name: "pari-regle", path: `/l/${L}/paris/${b.settled}`, as: "full" },
  { name: "pari-programme", path: `/l/${L}/paris/${b.scheduled}`, as: "full" },
  { name: "chat", path: `/l/${L}/chat`, as: "full" },
  { name: "chat-vide", path: `/l/${E}/chat`, as: "empty" },
  {
    name: "gif",
    path: `/l/${L}/chat`,
    as: "full",
    open: tap("button[aria-label='Envoyer un GIF']"),
  },
  { name: "classement", path: `/l/${L}/classement`, as: "full" },
  { name: "classement-seul", path: `/l/${E}/classement`, as: "empty" },
  {
    name: "profil",
    path: `/l/${L}/classement`,
    as: "full",
    open: tap("main button:has-text('WWWWWWWWWWWWWWWW_')"),
  },
  { name: "moi", path: `/l/${L}/moi`, as: "full" },
  { name: "moi-vide", path: `/l/${E}/moi`, as: "empty" },
  { name: "moi-succes", path: `/l/${L}/moi?onglet=succes`, as: "full" },
  { name: "moi-cosmetiques", path: `/l/${L}/moi?onglet=cosmetiques`, as: "full" },
  { name: "boutique", path: `/l/${L}/boutique`, as: "full" },
  {
    name: "boutique-achat",
    path: `/l/${L}/boutique`,
    as: "full",
    open: tap("button[aria-label^='Acheter']"),
  },
  { name: "inviter", path: `/l/${L}/inviter`, as: "full" },
  { name: "reglages-ligue", path: `/l/${L}/reglages`, as: "full" },
  {
    name: "tournee",
    path: `/l/${L}/reglages`,
    as: "full",
    open: tap("button:has-text('Tournée générale')"),
  },
  { name: "membres", path: `/l/${L}/reglages/membres`, as: "full" },
  { name: "journal", path: `/l/${L}/reglages/journal`, as: "full" },
  { name: "journal-vide", path: `/l/${E}/reglages/journal`, as: "empty" },
];

/** `SCREENS=paris,chat pnpm test:screens` : seulement ces écrans. */
const only = process.env.SCREENS?.split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const SELECTED = only?.length ? ROUTES.filter((r) => only.includes(r.name)) : ROUTES;

type Problem = { size: string; route: string; kind: string; detail: string };

/** Contrôles dans la page : débordement, zones d'appui, colonne centrée. */
async function inspect(page: Page, width: number) {
  return page.evaluate((wide) => {
    const vw = document.documentElement.clientWidth;
    const out: { kind: string; detail: string }[] = [];
    const describe = (el: Element) => {
      const label =
        el.getAttribute("aria-label") ||
        (el as HTMLElement).innerText?.replace(/\s+/g, " ").trim().slice(0, 40) ||
        el.getAttribute("href") ||
        "";
      return `<${el.tagName.toLowerCase()}> « ${label} »`;
    };
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      if (r.width <= 1 || r.height <= 1) return false;
      const style = getComputedStyle(el);
      return style.visibility !== "hidden" && style.display !== "none";
    };
    /**
     * Seule une rangée qui défile en largeur exprès (filtres, puces) peut
     * porter des éléments au-delà du bord. Un défilement vertical rend aussi
     * `overflow-x` calculé à `auto` : il ne compte pas.
     */
    const clipped = (el: Element) => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        if (p.classList.contains("overflow-x-auto"))
          return p.getBoundingClientRect().right <= vw + 1;
      }
      return false;
    };

    if (document.documentElement.scrollWidth > vw) {
      out.push({
        kind: "défilement horizontal",
        detail: `${document.documentElement.scrollWidth} px pour ${vw} px`,
      });
    }
    const seen = new Set<string>();
    for (const el of document.querySelectorAll("body *")) {
      if (!visible(el) || clipped(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.right > vw + 1 || r.left < -1) {
        const d = describe(el);
        if (!seen.has(d)) {
          seen.add(d);
          out.push({
            kind: "dépasse du bord",
            detail: `${d} de ${Math.round(Math.max(r.right - vw, -r.left))} px`,
          });
        }
      }
    }
    const targets = document.querySelectorAll(
      "a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=radio]",
    );
    for (const el of targets) {
      if (!visible(el)) continue;
      // Une case ou un champ compte avec la ligne ou le libellé qui le porte.
      const host = (el.closest("label") ?? el) as Element;
      const r = el.getBoundingClientRect();
      const h = host.getBoundingClientRect();
      const height = Math.max(r.height, h.height);
      const widthPx = Math.max(r.width, h.width);
      if (height < 43.5 || widthPx < 43.5) {
        out.push({
          kind: "zone d'appui",
          detail: `${describe(el)} ${Math.round(widthPx)}×${Math.round(height)}`,
        });
      }
    }
    if (wide) {
      // La colonne de l'app : l'enfant le plus large du corps de page.
      const column = [...document.body.children].sort(
        (a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width,
      )[0];
      const r = column?.getBoundingClientRect();
      if (r && (r.width > 481 || Math.abs(r.left - (vw - r.right)) > 1)) {
        out.push({
          kind: "colonne",
          detail: `largeur ${Math.round(r.width)}, marge ${Math.round(r.left)}`,
        });
      }
    }
    return out;
  }, width > 480);
}

let browser: Browser;
const sessions = new Map<Account, string>();
const problems: Problem[] = [];

async function login(email: string): Promise<string> {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto(`${BASE}/connexion`);
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", PASSWORD);
  await page.click("button[type=submit]");
  await page.waitForURL((url) => !url.pathname.startsWith("/connexion"), { timeout: 30_000 });
  const path = `${OUTPUT}/.session-${email}.json`;
  await context.storageState({ path });
  await context.close();
  return path;
}

beforeAll(async () => {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  sessions.set("full", await login(seeded.full.email));
  sessions.set("empty", await login(seeded.empty.email));
}, 120_000);

afterAll(async () => {
  await browser?.close();
  const lines = problems.map((p) => `| ${p.size} | ${p.route} | ${p.kind} | ${p.detail} |`);
  writeFileSync(
    `${OUTPUT}/rapport.md`,
    ["| Taille | Écran | Problème | Détail |", "| --- | --- | --- | --- |", ...lines].join("\n") +
      "\n",
  );
});

describe.each(SIZES)("%i × %i", (width, height) => {
  const size = `${width}x${height}`;
  let contexts: Map<Account, BrowserContext>;

  beforeAll(async () => {
    mkdirSync(`${OUTPUT}/${size}`, { recursive: true });
    contexts = new Map();
    for (const as of ["full", "empty", "none"] as const) {
      contexts.set(
        as,
        await browser.newContext({
          viewport: { width, height },
          deviceScaleFactor: 1,
          hasTouch: true,
          isMobile: width <= 480,
          storageState: sessions.get(as),
        }),
      );
    }
  });

  afterAll(async () => {
    for (const context of contexts.values()) await context.close();
  });

  it.each(SELECTED.map((r) => [r.name, r] as const))("%s", async (name, route) => {
    const page = await contexts.get(route.as)!.newPage();
    try {
      await page.goto(`${BASE}${route.path}`, { waitUntil: "load", timeout: 60_000 });
      await page.waitForTimeout(700);
      if (route.open) await route.open(page);
      const found = await inspect(page, width);
      await page.screenshot({ path: `${OUTPUT}/${size}/${name}.png`, fullPage: true });
      for (const f of found) problems.push({ size, route: name, ...f });
      expect(found, `${name} à ${size}`).toEqual([]);
    } finally {
      await page.close();
    }
  });
});
