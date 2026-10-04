import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import manifest from "@/app/manifest";
import { EnvBanner } from "@/components/env/EnvBanner";
import { LAST_LEAGUE_COOKIE } from "@/lib/cookies";
import { proxy } from "@/proxy";

// docs/VALIDATION.md, A.5 : la validation se voit partout ; la production, sans
// APP_ENV, reste telle qu'avant.
afterEach(() => vi.unstubAllEnvs());

const request = (path: string) => new NextRequest(new URL(path, "https://val.jentapp.nocly.fr"));

describe("production, sans APP_ENV", () => {
  it("ni bandeau, ni noindex, nom JentApp", () => {
    vi.stubEnv("APP_ENV", "");
    expect(EnvBanner()).toBeNull();
    expect(proxy(request("/connexion")).headers.get("X-Robots-Tag")).toBeNull();
    expect(manifest()).toMatchObject({ name: "JentApp", short_name: "JentApp" });
  });

  it("le cookie de la dernière ligue est toujours posé", () => {
    vi.stubEnv("APP_ENV", "");
    const league = "5f0c8a52-6a5e-4b8e-9a1e-2f7c1d3b4a5e";
    expect(proxy(request(`/l/${league}/paris`)).cookies.get(LAST_LEAGUE_COOKIE)?.value).toBe(
      league,
    );
  });
});

describe("validation", () => {
  it("bandeau VALIDATION, noindex sur toute page, nom du manifeste", () => {
    vi.stubEnv("APP_ENV", "validation");
    expect(JSON.stringify(EnvBanner())).toContain("VALIDATION");
    for (const path of ["/", "/connexion", "/api/health", "/manifest.webmanifest"]) {
      expect(proxy(request(path)).headers.get("X-Robots-Tag")).toBe("noindex");
    }
    expect(manifest()).toMatchObject({ name: "JentApp validation", short_name: "Validation" });
  });
});
