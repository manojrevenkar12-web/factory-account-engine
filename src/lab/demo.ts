// Builds the console's demo data: the real pipeline (regex reader, template drafts, the real store) run
// over a small simulated market. Same output every time.

import { loadConfig } from "../core/config.ts";
import { runPipeline } from "../core/pipeline.ts";
import type { Company, Contact, Plant, SignalDoc } from "../core/types.ts";
import { RegexReader } from "../core/model/readers.ts";
import { World } from "./world/world.ts";

export async function buildDemo(seed = 77, companies = 160): Promise<{ view: Record<string, unknown>; market: Record<string, unknown> }> {
  const world = new World();
  const cfg = loadConfig();
  const m = world.market(seed);
  const keep = new Set(m.companies.slice(0, companies).map((c) => c.key));
  const contactsByKey = new Map(m.contacts.map((c) => [c.key, c]));
  const input = {
    docs: m.docs.filter((d) => keep.has(d.truth.companyKey)).map<SignalDoc>((d) => ({ id: d.id, source: d.source, publishedAt: d.publishedAt, text: d.text })),
    companies: m.companies.filter((c) => keep.has(c.key)).map<Company>((c) => ({ key: c.key, name: c.name, domain: c.domain, hqCountry: c.hqCountry, industry: c.industry, employees: c.employees })),
    plants: m.plants.filter((p) => keep.has(p.companyKey)).map<Plant>((p) => ({ key: p.key, companyKey: p.companyKey, city: p.city, country: p.country, plantType: p.listedType as Plant["plantType"], lines: p.listedLines })),
    aliases: Object.fromEntries(Object.entries(m.knownAliases).filter(([, k]) => keep.has(k))),
    contacts: m.contacts.filter((c) => keep.has(c.companyKey)).map<Contact>((c) => ({ key: c.key, plantKey: c.plantKey, companyKey: c.companyKey, role: c.role, name: c.name, email: null, phone: null, consent: c.consent })),
    suppressed: new Set(m.suppression.filter((k) => keep.has(contactsByKey.get(k)?.companyKey ?? ""))),
    hubspot: m.hubspot.filter((h) => keep.has(h.truthCompanyKey)).map((h) => ({ id: h.id, name: h.name, domain: h.domain, fae_account_key: null })),
    accountsToWork: 40,
  };
  const result = await runPipeline(input, {
    reader: new RegexReader(),
    drafter: null,
    providers: {
      lookup: (pid, field, t) => { const c = contactsByKey.get(t.contactKey); const v = c ? world.providerLookup(seed, c, pid, field) : null; return v ? { value: v } : null; },
      verifyEmail: (_e, t) => contactsByKey.get(t.contactKey)?.emailValid ?? false,
    },
    ...cfg,
  });
  const tiers = { A: 0, B: 0, C: 0 };
  for (const s of result.scores) tiers[s.tier]++;
  const view = {
    market: { companies: input.companies.length, plants: input.plants.length, documents: input.docs.length, hubspotRecords: input.hubspot.length, simulated: true },
    signals: {
      accepted: result.signals.accepted.length,
      rejected: result.signals.rejected.length,
      companyLevel: result.signals.companyLevel.length,
      byType: Object.entries(result.signals.accepted.reduce<Record<string, number>>((a, s) => { a[s.type] = (a[s.type] ?? 0) + 1; return a; }, {})).sort((a, b) => b[1] - a[1]),
      recent: result.signals.accepted.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12),
    },
    tiers,
    accounts: result.accounts.map((a) => ({
      plantKey: a.plant.key, company: a.company.name, city: a.plant.city, country: a.plant.country, industry: a.company.industry,
      tier: a.score.tier, score: a.score.score, fit: a.score.fit, timing: a.score.timing, reasons: a.score.reasons, signal: a.signal,
      contacts: a.contacts.map((c) => ({
        name: c.contact.name, role: c.contact.role, sequence: c.sequence, blocked: c.channels.blocked, basis: c.channels.basis,
        enrichment: { email: !!c.enrichment.email, phone: !!c.enrichment.phone, spentEur: c.enrichment.spentEur, calls: c.enrichment.calls, skipped: c.enrichment.skipped },
        message: c.message ? { body: c.message.body, sendable: c.message.sendable, sentences: c.message.sentences } : null,
      })),
    })),
    sync: { attachKeys: result.sync.keyAttachments.length, companyUpserts: result.sync.companyUpserts.length, contactUpserts: result.sync.contactUpserts.length, parentChild: result.sync.parentChild.length, firstRequests: onePerKind(result.requests) },
    costs: result.costs,
  };
  // The account export the service loads: what a GTM team would hold in its own database.
  const market = { ...input, suppressed: [...input.suppressed], providerHits: Object.fromEntries(m.contacts.filter((c) => keep.has(c.companyKey)).map((c) => [c.key, { email: world.providerLookup(seed, c, "pool_b", "email"), phone: world.providerLookup(seed, c, "pool_b", "phone"), emailValid: c.emailValid }])) };
  return { view, market };
}

/** The first request of each kind (method and path without the record id), so the console shows every step of a sync. */
function onePerKind<T extends { method: string; path: string }>(requests: T[]): T[] {
  const seen = new Set<string>();
  return requests.filter((r) => {
    const kind = `${r.method} ${r.path.replace(/\/[^/]*\d[^/]*$/, "/:id")}`;
    if (seen.has(kind)) return false;
    seen.add(kind);
    return true;
  });
}
