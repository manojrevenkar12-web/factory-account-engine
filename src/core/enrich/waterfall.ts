// Enrichment waterfall: ask the provider with the lowest cost per expected hit first, stop at the first
// verified hit, never spend past the account's budget, and never buy a field no allowed channel can use.

import type { Channel } from "../outreach/channel.ts";

export type Field = "email" | "phone";

export interface ProviderConfig {
  id: string;
  costEur: number;
  fields: Field[];
  observedHitRate: Record<string, number>;
}

export interface LookupTarget {
  contactKey: string;
  country: string;
}

/** The outside world: a provider answers or not. Implemented by HTTP adapters live and by the world in the lab. */
export interface ProviderClient {
  lookup(providerId: string, field: Field, target: LookupTarget): { value: string } | null;
  verifyEmail(email: string, target: LookupTarget): boolean;
}

export interface WaterfallResult {
  email: string | null;
  phone: string | null;
  spentEur: number;
  calls: { provider: string; field: Field; hit: boolean; costEur: number }[];
  skipped: string[];
}

export function fieldsWanted(allowed: Channel[]): Field[] {
  const out: Field[] = [];
  if (allowed.includes("email")) out.push("email");
  if (allowed.includes("phone")) out.push("phone");
  return out;
}

export function providerOrder(providers: ProviderConfig[], field: Field, country: string): ProviderConfig[] {
  const rate = (p: ProviderConfig): number => p.observedHitRate[country] ?? p.observedHitRate.default ?? 0.01;
  return providers.filter((p) => p.fields.includes(field)).sort((a, b) => a.costEur / rate(a) - b.costEur / rate(b) || a.id.localeCompare(b.id));
}

export function runWaterfall(
  target: LookupTarget,
  fields: Field[],
  providers: ProviderConfig[],
  budgetEur: number,
  verifyCostEur: number,
  client: ProviderClient,
): WaterfallResult {
  const res: WaterfallResult = { email: null, phone: null, spentEur: 0, calls: [], skipped: [] };
  if (fields.length === 0) { res.skipped.push("no allowed channel needs an email or phone number"); return res; }
  for (const field of fields) {
    for (const p of providerOrder(providers, field, target.country)) {
      const cost = p.costEur + (field === "email" ? verifyCostEur : 0);
      if (res.spentEur + cost > budgetEur + 1e-9) { res.skipped.push(`${field} via ${p.id}: over the ${budgetEur} EUR budget`); break; }
      res.spentEur += p.costEur;
      const hit = client.lookup(p.id, field, target);
      let ok = hit !== null;
      if (hit && field === "email") {
        res.spentEur += verifyCostEur;
        ok = client.verifyEmail(hit.value, target);
      }
      res.calls.push({ provider: p.id, field, hit: ok, costEur: Math.round(cost * 100) / 100 });
      if (ok && hit) { res[field] = hit.value; break; }
    }
  }
  res.spentEur = Math.round(res.spentEur * 100) / 100;
  return res;
}
