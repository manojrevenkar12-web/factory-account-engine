import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadConfig, ROOT } from "../src/core/config.ts";
import { RegexReader } from "../src/core/model/readers.ts";
import { runPipeline } from "../src/core/pipeline.ts";
import { buildApp, parseKeys, type AccountExport } from "../src/server/app.ts";

const cfg = loadConfig();
const data = JSON.parse(readFileSync(`${ROOT}data/demo-market.json`, "utf8")) as AccountExport & { providerHits: Record<string, { email: string | null; phone: string | null; emailValid: boolean }> };
const providers = {
  lookup: (_p: string, field: "email" | "phone", t: { contactKey: string }) => { const v = data.providerHits[t.contactKey]?.[field]; return v ? { value: v } : null; },
  verifyEmail: (_e: string, t: { contactKey: string }) => data.providerHits[t.contactKey]?.emailValid ?? false,
};
const app = buildApp({ data, keys: parseKeys("k1"), reader: new RegexReader(), providers, ...cfg });
const auth = { authorization: "Bearer k1" };

describe("service", () => {
  it("requires an API key", async () => {
    expect((await app.inject({ method: "POST", url: "/v1/score" })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/health" })).statusCode).toBe(200);
  });

  it("ingests a document once and rejects what it cannot verify", async () => {
    const company = data.companies[0] as AccountExport["companies"][number];
    const plant = data.plants.find((p) => p.companyKey === company.key) as AccountExport["plants"][number];
    const doc = { id: "new-1", source: "jobboard", publishedAt: "2026-10-30", text: `${company.name} is hiring an Industrial Engineer for time studies (MTM) at its ${plant.city} plant. The role analyses cycle times.` };
    const first = (await app.inject({ method: "POST", url: "/v1/signals", headers: auth, payload: { docs: [doc] } })).json() as { accepted: number };
    const again = (await app.inject({ method: "POST", url: "/v1/signals", headers: auth, payload: { docs: [doc] } })).json() as { accepted: number; duplicates: number };
    expect(first.accepted).toBe(1);
    expect(again).toMatchObject({ accepted: 0, duplicates: 1 });
    const bad = (await app.inject({ method: "POST", url: "/v1/signals", headers: auth, payload: { docs: [{ id: "x", publishedAt: "2026-10-01", text: "Acme Unknown is hiring an Industrial Engineer for time studies (MTM) at its Nowhere plant." }] } })).json() as { rejected: { reason: string }[] };
    expect(bad.rejected[0]?.reason).toMatch(/does not resolve/);
    expect((await app.inject({ method: "POST", url: "/v1/signals", headers: auth, payload: { docs: [] } })).statusCode).toBe(400);
  });

  it("scores plants and reports only newly tier-A plants on the next run", async () => {
    const a = (await app.inject({ method: "POST", url: "/v1/score", headers: auth })).json() as { tiers: { A: number }; newTierA: unknown[] };
    const b = (await app.inject({ method: "POST", url: "/v1/score", headers: auth })).json() as { newTierA: unknown[] };
    expect(a.newTierA.length).toBe(a.tiers.A);
    expect(b.newTierA).toEqual([]);
  });

  it("plans a HubSpot sync keyed by fae_account_key", async () => {
    const r = (await app.inject({ method: "POST", url: "/v1/sync/plan", headers: auth, payload: { accountsToWork: 15 } })).json() as { requests: { path: string; body: { inputs?: { idProperty: string }[] } }[] };
    const upsert = r.requests.find((x) => x.path === "/crm/v3/objects/companies/batch/upsert");
    expect(upsert?.body.inputs?.every((i) => i.idProperty === "fae_account_key")).toBe(true);
  });

  it("suppresses a contact", async () => {
    const r = await app.inject({ method: "POST", url: "/v1/suppress", headers: auth, payload: { contactKey: "someone" } });
    expect(r.json()).toEqual({ suppressed: "someone" });
  });
});

describe("pipeline end to end", () => {
  it("every planned first touch is allowed in its country and every message is sendable", async () => {
    const r = await runPipeline({ ...data, suppressed: new Set(data.suppressed), accountsToWork: 40 }, { reader: new RegexReader(), drafter: null, providers, ...cfg });
    expect(r.accounts.length).toBeGreaterThan(10);
    for (const a of r.accounts) for (const c of a.contacts) {
      if (a.plant.country === "Germany") expect(c.sequence).not.toContain("email");
      if (c.message) expect(c.message.sendable).toBe(true);
      expect(c.enrichment.spentEur).toBeLessThanOrEqual(cfg.playbook.budgetEurPerAccount[a.score.tier] + 1e-9);
    }
  });
});
