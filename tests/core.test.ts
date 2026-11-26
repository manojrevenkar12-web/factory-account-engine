import { describe, expect, it } from "vitest";
import { CompanyIndex, normalizeCity, normalizeCompany, plantKey } from "../src/core/accounts/resolve.ts";
import { scorePlant } from "../src/core/accounts/score.ts";
import { AccountStore } from "../src/core/accounts/store.ts";
import { loadConfig } from "../src/core/config.ts";
import { planRequests, planSync } from "../src/core/crm/hubspot.ts";
import { fieldsWanted, providerOrder, runWaterfall, type ProviderClient } from "../src/core/enrich/waterfall.ts";
import { decideChannels, sequenceFor } from "../src/core/outreach/channel.ts";
import { checkMessage } from "../src/core/outreach/message.ts";
import { signalCitation, templateDraft } from "../src/core/outreach/template.ts";
import { dedupeSignals, validateSignal } from "../src/core/signals/validate.ts";
import type { AcceptedSignal, Company, Plant, SignalDoc } from "../src/core/types.ts";

const { playbook, channels, platform } = loadConfig();
const evidence = Object.fromEntries(Object.entries(playbook.signals).map(([k, v]) => [k, v.evidence ?? []]));
const brenner: Company = { key: "brenner-elektronik.example", name: "Brenner Elektronik GmbH & Co. KG", domain: "brenner-elektronik.example", hqCountry: "Germany", industry: "electronics", employees: 2400 };
const plantR: Plant = { key: plantKey(brenner.key, "Regensburg"), companyKey: brenner.key, city: "Regensburg", country: "Germany", plantType: "manual_assembly", lines: 6 };
const plantU: Plant = { key: plantKey(brenner.key, "Greenville"), companyKey: brenner.key, city: "Greenville", country: "United States", plantType: null, lines: null };
const index = new CompanyIndex([brenner], { BEG: brenner.key });
const plants = new Map([plantR, plantU].map((p) => [p.key, p]));
const doc: SignalDoc = { id: "d1", source: "jobboard", publishedAt: "2026-10-12", text: "Brenner Elektronik GmbH & Co. KG sucht Industrial Engineer (m/w/d) für Zeitstudien nach REFA im Werk Regensburg. Sie analysieren Taktzeiten." };
const quote = "Brenner Elektronik GmbH & Co. KG sucht Industrial Engineer (m/w/d) für Zeitstudien nach REFA im Werk Regensburg.";
const v = (over: Partial<Parameters<typeof validateSignal>[0]>) =>
  validateSignal({ docId: "d1", company: "Brenner Elektronik", plantCity: "Regensburg", country: null, type: "ie_hiring", date: "2026-10-12", quote, ...over }, doc, index, plants, platform.asOf, 270, 400, evidence);

describe("entity resolution", () => {
  it("strips legal forms and maps known aliases, without fuzzy guessing", () => {
    expect(normalizeCompany("Brenner Elektronik GmbH & Co. KG")).toBe("brenner elektronik");
    expect(index.resolve("Brenner Elektronik AG")?.key).toBe(brenner.key);
    expect(index.resolve("BEG")?.key).toBe(brenner.key);
    expect(index.resolve("Brenner Electronics")).toBeNull();
    expect(normalizeCity("München")).toBe("Munich");
  });
});

describe("signal validation", () => {
  it("accepts a quoted, typed, dated signal at plant level", () => {
    expect(v({}).accepted?.plantKey).toBe(plantR.key);
  });
  it("rejects invented quotes, unsupported types, stale or future dates and unknown companies", () => {
    expect(v({ quote: "Brenner opens a new assembly line in Regensburg" }).reason).toMatch(/not in the document/);
    expect(v({ type: "new_line" }).reason).toMatch(/does not support 'new_line'/);
    expect(v({ type: "headcount_up" }).reason).toMatch(/unknown signal type/);
    expect(v({ date: "2025-01-01" }).reason).toMatch(/older than/);
    expect(v({ date: "2027-01-01" }).reason).toMatch(/future/);
    expect(v({ company: "Unknown Industries" }).reason).toMatch(/does not resolve/);
  });
  it("keeps a signal at company level when the city is not in the document or has no plant", () => {
    expect(v({ plantCity: "Greenville" }).accepted?.plantKey).toBeNull();
    expect(v({ plantCity: "Greenville" }).reason).toMatch(/not in the document/);
  });
  it("counts a posting copied to several boards once", () => {
    const s = v({}).accepted as AcceptedSignal;
    expect(dedupeSignals([s, { ...s, docId: "d1b" }])).toHaveLength(1);
  });
});

describe("scoring", () => {
  const sig = (type: AcceptedSignal["type"], date: string, pk: string | null = plantR.key): AcceptedSignal => ({ docId: `x-${type}-${date}`, companyKey: brenner.key, plantKey: pk, type, date, quote: "q" });
  it("ranks a fitting plant with a recent signal into tier A", () => {
    const s = scorePlant(plantR, brenner, [sig("ie_hiring", "2026-10-20"), sig("new_line", "2026-09-01")], playbook, platform.asOf);
    expect(s.tier).toBe("A");
    expect(s.reasons.join(" ")).toMatch(/ie_hiring/);
  });
  it("decays old signals, sinks closed plants and ignores other plants' signals", () => {
    const fresh = scorePlant(plantR, brenner, [sig("ie_hiring", "2026-10-20")], playbook, platform.asOf).timing;
    const old = scorePlant(plantR, brenner, [sig("ie_hiring", "2026-03-01")], playbook, platform.asOf).timing;
    expect(fresh).toBeGreaterThan(old);
    expect(scorePlant(plantR, brenner, [sig("new_line", "2026-10-20"), sig("closure", "2026-10-25")], playbook, platform.asOf).tier).toBe("C");
    expect(scorePlant(plantU, brenner, [sig("new_line", "2026-10-20")], playbook, platform.asOf).timing).toBe(0);
  });
});

describe("channel rules", () => {
  const none = { express: null, presumed: null };
  it("never cold-emails Germany, and calls only with documented presumed consent", () => {
    const d = decideChannels("Germany", none, false, channels);
    expect(d.allowed).toEqual(["linkedin", "letter"]);
    expect(decideChannels("Germany", { express: null, presumed: "met_in_person" }, false, channels).allowed).toContain("phone");
    expect(decideChannels("Germany", { express: "webinar_opt_in", presumed: null }, false, channels).allowed).toContain("email");
  });
  it("emails the US with an opt-out, treats unknown countries as strictest and honours suppression", () => {
    const us = decideChannels("United States", none, false, channels);
    expect(sequenceFor(us)).toEqual(["email", "phone", "linkedin"]);
    expect(us.needsOptOut).toBe(true);
    expect(decideChannels("Narnia", none, false, channels).allowed).toEqual(["linkedin", "letter"]);
    expect(decideChannels("United States", none, true, channels).allowed).toEqual([]);
  });
});

describe("enrichment waterfall", () => {
  const calls: string[] = [];
  const client = (hit: Record<string, boolean>, valid = true): ProviderClient => ({
    lookup: (p, f) => { calls.push(`${p}:${f}`); return hit[`${p}:${f}`] ? { value: `${f}@${p}` } : null; },
    verifyEmail: () => valid,
  });
  it("orders providers by cost per expected hit and stops at the first verified hit", () => {
    expect(providerOrder(platform.enrichment.providers, "email", "Germany").map((p) => p.id)).toEqual(["pool_a", "pool_b", "pool_c"]);
    calls.length = 0;
    const r = runWaterfall({ contactKey: "c", country: "Germany" }, ["email"], platform.enrichment.providers, 4, 0.02, client({ "pool_b:email": true }));
    expect(r.email).toBe("email@pool_b");
    expect(calls).toEqual(["pool_a:email", "pool_b:email"]);
  });
  it("buys nothing that no allowed channel can use, and keeps to the budget", () => {
    expect(fieldsWanted(["linkedin", "letter"])).toEqual([]);
    expect(runWaterfall({ contactKey: "c", country: "Germany" }, [], platform.enrichment.providers, 4, 0.02, client({})).spentEur).toBe(0);
    const r = runWaterfall({ contactKey: "c", country: "Germany" }, ["email"], platform.enrichment.providers, 0.5, 0.02, client({}));
    expect(r.spentEur).toBeLessThanOrEqual(0.5);
    expect(r.skipped.join(" ")).toMatch(/budget/);
  });
  it("keeps going when an email fails verification", () => {
    const r = runWaterfall({ contactKey: "c", country: "United States" }, ["email"], platform.enrichment.providers, 4, 0.02, client({ "pool_a:email": true, "pool_b:email": true }, false));
    expect(r.email).toBeNull();
    expect(r.calls.length).toBe(3);
  });
});

describe("message check", () => {
  const s: AcceptedSignal = { docId: "d1", companyKey: brenner.key, plantKey: plantR.key, type: "ie_hiring", date: "2026-10-12", quote };
  const proof = (id: string) => playbook.proofPoints.find((p) => p.id === id)?.text;
  const lookup = (c: string) => (c === signalCitation(s) ? s.quote : proof(c));
  it("sends the template: a quoted signal, an approved proof point, a question", () => {
    const m = checkMessage(templateDraft(s, proof), lookup, platform.claims, playbook.messageNeutral, null);
    expect(m.sendable).toBe(true);
    expect(m.body).toContain("Saw your posting");
  });
  it("drops invented places and numbers, and asks that state facts", () => {
    const m = checkMessage([
      { kind: "fact", text: "Congratulations on the new line in Dallas.", citation: signalCitation(s) },
      { kind: "fact", text: "Plants like yours cut cycle time by 23% in the first quarter.", citation: "pp-cycle" },
      { kind: "ask", text: "Bosch saved 40% with us, want a call?", citation: null },
    ], lookup, platform.claims, playbook.messageNeutral, null);
    expect(m.sentences.map((x) => x.kept)).toEqual([false, false, false]);
    expect(m.sendable).toBe(false);
  });
});

describe("HubSpot sync plan", () => {
  it("keys plants under their parent, attaches keys to existing records, never upserts by domain", () => {
    const scores = new Map([[plantR.key, { plantKey: plantR.key, fit: 1, timing: 1, score: 0.9, tier: "A" as const, reasons: [] }]]);
    const plan = planSync([brenner], [plantR, plantU], scores, [{ key: "k", plantKey: plantR.key, companyKey: brenner.key, role: "plant_manager", name: "A B", email: "a@b.example", phone: null, consent: { express: null, presumed: null } }],
      [{ id: "77", name: "BEG", domain: null, fae_account_key: null }], (n) => index.resolve(n)?.key ?? null);
    expect(plan.keyAttachments).toEqual([{ hubspotId: "77", fae_account_key: brenner.key, matchedBy: "name" }]);
    expect(plan.companyUpserts.every((u) => u.idProperty === "fae_account_key")).toBe(true);
    expect(plan.parentChild).toEqual([{ parentKey: brenner.key, childKey: plantR.key }]);
    expect(plan.skipped.join(" ")).toMatch(/greenville.*not synced/);
    const req = planRequests(plan);
    expect(req[0]).toMatchObject({ method: "PATCH", path: "/crm/v3/objects/companies/77" });
    expect(JSON.stringify(req)).toContain('"associationTypeId":13');
  });
});

describe("account store", () => {
  it("is idempotent and records each sequence step once", () => {
    const st = new AccountStore();
    st.upsertCompany(brenner);
    st.upsertPlant(plantR);
    st.upsertPlant({ ...plantR, plantType: null, lines: null });
    expect(st.plants()[0]?.plantType).toBe("manual_assembly");
    const sig = v({}).accepted as AcceptedSignal;
    expect(st.addSignal(sig)).toBe(true);
    expect(st.addSignal(sig)).toBe(false);
    expect(st.recordTouch("c1", 0, "email")).toBe(true);
    expect(st.recordTouch("c1", 0, "email")).toBe(false);
    st.suppress("C1@X.example", "stop", "2026-11-01");
    expect(st.isSuppressed("c1@x.example")).toBe(true);
  });
});
