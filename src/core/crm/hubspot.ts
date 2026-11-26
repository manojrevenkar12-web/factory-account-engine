// HubSpot sync plan. HubSpot will not upsert companies by domain (domain is not a unique property), and
// every plant of a company shares its domain, so each record carries its own unique key, fae_account_key:
// "<domain>" for the company, "<domain>#<city>" for a plant. Plants are child companies of their parent.
// Existing records without a key are matched by domain or normalized name and updated, never duplicated.

import { normalizeCompany } from "../accounts/resolve.ts";
import type { Company, Contact, Plant } from "../types.ts";
import type { PlantScore } from "../accounts/score.ts";

export interface HubspotCompanyRecord { id: string; name: string; domain: string | null; fae_account_key: string | null }

export interface SyncPlan {
  companyUpserts: { idProperty: "fae_account_key"; id: string; properties: Record<string, string> }[];
  keyAttachments: { hubspotId: string; fae_account_key: string; matchedBy: "domain" | "name" }[];
  parentChild: { parentKey: string; childKey: string }[];
  contactUpserts: { idProperty: "email"; id: string; properties: Record<string, string>; companyKey: string }[];
  skipped: string[];
}

const rootDomain = (d: string | null): string | null => (d ? d.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "") : null);

export function planSync(
  companies: Company[],
  plants: Plant[],
  scores: Map<string, PlantScore>,
  contacts: Contact[],
  existing: HubspotCompanyRecord[],
  resolveName: (name: string) => string | null = () => null,
): SyncPlan {
  const plan: SyncPlan = { companyUpserts: [], keyAttachments: [], parentChild: [], contactUpserts: [], skipped: [] };
  const keyed = new Set(existing.map((e) => e.fae_account_key).filter((k): k is string => !!k));
  const byDomain = new Map<string, HubspotCompanyRecord>();
  const byName = new Map<string, HubspotCompanyRecord>();
  const byAlias = new Map<string, HubspotCompanyRecord>();
  for (const e of existing) {
    if (e.fae_account_key) continue;
    const d = rootDomain(e.domain);
    if (d) byDomain.set(d, e);
    byName.set(normalizeCompany(e.name), e);
    const k = resolveName(e.name);
    if (k) byAlias.set(k, e);
  }

  const used = new Set<string>();
  for (const c of companies) {
    if (!keyed.has(c.key)) {
      const viaDomain = byDomain.get(c.domain);
      const viaName = byName.get(normalizeCompany(c.name)) ?? byAlias.get(c.key);
      const match = viaDomain ?? viaName;
      if (match && !used.has(match.id)) {
        used.add(match.id);
        plan.keyAttachments.push({ hubspotId: match.id, fae_account_key: c.key, matchedBy: viaDomain ? "domain" : "name" });
      }
    }
    plan.companyUpserts.push({ idProperty: "fae_account_key", id: c.key, properties: { name: c.name, domain: c.domain, country: c.hqCountry, industry: c.industry, numberofemployees: String(c.employees), fae_level: "company" } });
  }
  for (const p of plants) {
    const s = scores.get(p.key);
    if (!s || s.tier === "C") { plan.skipped.push(`${p.key}: tier C, not synced`); continue; }
    plan.companyUpserts.push({ idProperty: "fae_account_key", id: p.key, properties: { name: `${companies.find((c) => c.key === p.companyKey)?.name ?? p.companyKey} – ${p.city}`, city: p.city, country: p.country, fae_level: "plant", fae_tier: s.tier, fae_score: String(s.score) } });
    plan.parentChild.push({ parentKey: p.companyKey, childKey: p.key });
  }
  for (const ct of contacts) {
    if (!ct.email) { plan.skipped.push(`${ct.key}: no email, kept as a task in the sequence tool`); continue; }
    plan.contactUpserts.push({ idProperty: "email", id: ct.email, properties: { email: ct.email, fae_role: ct.role, fae_consent: ct.consent.express ?? ct.consent.presumed ?? "none" }, companyKey: ct.plantKey ?? ct.companyKey });
  }
  return plan;
}

/** The HTTP requests for a plan, in order. Association type 13 is HubSpot's parent-to-child company label. */
export function planRequests(plan: SyncPlan): { method: "POST" | "PATCH"; path: string; body: unknown }[] {
  const out: { method: "POST" | "PATCH"; path: string; body: unknown }[] = [];
  for (const a of plan.keyAttachments) {
    out.push({ method: "PATCH", path: `/crm/v3/objects/companies/${a.hubspotId}`, body: { properties: { fae_account_key: a.fae_account_key } } });
  }
  for (let i = 0; i < plan.companyUpserts.length; i += 100) {
    out.push({ method: "POST", path: "/crm/v3/objects/companies/batch/upsert", body: { inputs: plan.companyUpserts.slice(i, i + 100) } });
  }
  for (let i = 0; i < plan.contactUpserts.length; i += 100) {
    out.push({ method: "POST", path: "/crm/v3/objects/contacts/batch/upsert", body: { inputs: plan.contactUpserts.slice(i, i + 100).map(({ companyKey: _c, ...x }) => x) } });
  }
  if (plan.parentChild.length > 0) {
    out.push({ method: "POST", path: "/crm/v4/associations/companies/companies/batch/create", body: { inputs: plan.parentChild.map((p) => ({ from: { fae_account_key: p.parentKey }, to: { fae_account_key: p.childKey }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 13 }] })) } });
  }
  return out;
}
