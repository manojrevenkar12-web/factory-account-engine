// Entity resolution: many spellings of one company, many plants under one domain.
// A name never decides alone; it must resolve to a known company in the account database.

import type { Company } from "../types.ts";

const LEGAL = /\b(gmbh\s*&\s*co\.?\s*kg|gmbh|ag|se|kgaa|kg|ohg|inc\.?|llc|ltd\.?|plc|corp\.?|corporation|co\.?|s\.?a\.?|s\.?r\.?o\.?|sp\.?\s*z\s*o\.?\s*o\.?|b\.?v\.?|holding|group|gruppe)\b/g;

export function normalizeCompany(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " & ")
    .replace(LEGAL, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const CITY_ALIASES: Record<string, string> = {
  munchen: "Munich", muenchen: "Munich", munich: "Munich",
  nurnberg: "Nuremberg", nuernberg: "Nuremberg", nuremberg: "Nuremberg",
  koln: "Cologne", koeln: "Cologne", cologne: "Cologne",
  wien: "Vienna", vienna: "Vienna", praha: "Prague", prague: "Prague",
  "frankfurt am main": "Frankfurt", frankfurt: "Frankfurt",
};

export function normalizeCity(city: string): string {
  const k = city.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
  if (CITY_ALIASES[k]) return CITY_ALIASES[k] as string;
  return city.trim().replace(/\s+/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export function citySlug(city: string): string {
  return normalizeCity(city).toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

export function plantKey(companyKey: string, city: string): string {
  return `${companyKey}#${citySlug(city)}`;
}

export class CompanyIndex {
  private readonly byName = new Map<string, Company>();
  private readonly byKey = new Map<string, Company>();
  private readonly aliases: Map<string, string>;

  constructor(companies: Company[], aliases: Record<string, string> = {}) {
    this.aliases = new Map(Object.entries(aliases).map(([a, k]) => [normalizeCompany(a), k]));
    for (const c of companies) {
      this.byKey.set(c.key, c);
      this.byName.set(normalizeCompany(c.name), c);
    }
  }

  get(key: string): Company | undefined { return this.byKey.get(key); }

  /** Exact normalized name, a known alias, or nothing. No fuzzy guessing: an unknown name goes to review. */
  resolve(name: string): Company | null {
    const n = normalizeCompany(name);
    const alias = this.aliases.get(n);
    if (alias) return this.byKey.get(alias) ?? null;
    return this.byName.get(n) ?? null;
  }
}
