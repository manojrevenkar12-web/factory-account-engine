// Code decides whether a signal the model read is real: the quote must be in the document word for word,
// the type must be known, the date must be in the window, and the company must resolve. A city the
// company has no plant in keeps the signal at company level instead of inventing a plant.

import { CompanyIndex, normalizeCity, plantKey } from "../accounts/resolve.ts";
import { SIGNAL_TYPES, type AcceptedSignal, type ExtractedSignal, type Plant, type SignalDoc, type SignalType } from "../types.ts";

export interface SignalVerdict {
  accepted: AcceptedSignal | null;
  reason: string;
}

const squash = (s: string): string => s.replace(/\s+/g, " ").trim().toLowerCase();

export function validateSignal(
  x: ExtractedSignal,
  doc: SignalDoc | undefined,
  companies: CompanyIndex,
  plants: Map<string, Plant>,
  asOf: string,
  windowDays: number,
  maxQuoteChars: number,
  evidence: Partial<Record<SignalType, string[]>> = {},
): SignalVerdict {
  if (!doc) return { accepted: null, reason: `document ${x.docId} not found` };
  if (!SIGNAL_TYPES.includes(x.type as SignalType)) return { accepted: null, reason: `unknown signal type '${x.type}'` };
  if (!x.quote || x.quote.length > maxQuoteChars) return { accepted: null, reason: "quote missing or too long" };
  if (!squash(doc.text).includes(squash(x.quote))) return { accepted: null, reason: "quote is not in the document" };
  const terms = evidence[x.type as SignalType];
  if (terms && terms.length > 0 && !terms.some((t) => squash(x.quote).includes(t.toLowerCase()))) {
    return { accepted: null, reason: `the quote does not support '${x.type}'` };
  }
  const d = Date.parse(x.date);
  const now = Date.parse(asOf);
  if (Number.isNaN(d)) return { accepted: null, reason: `bad date '${x.date}'` };
  if (d > now) return { accepted: null, reason: "date is in the future" };
  if ((now - d) / 86_400_000 > windowDays) return { accepted: null, reason: `older than ${windowDays} days` };
  const company = companies.resolve(x.company);
  if (!company) return { accepted: null, reason: `company '${x.company}' does not resolve to a known account` };
  let pk: string | null = null;
  const cityInDoc = x.plantCity !== null && squash(doc.text).includes(squash(x.plantCity));
  if (x.plantCity && cityInDoc) {
    const candidate = plantKey(company.key, normalizeCity(x.plantCity));
    if (plants.has(candidate)) pk = candidate;
  }
  return {
    accepted: { docId: x.docId, companyKey: company.key, plantKey: pk, type: x.type as SignalType, date: new Date(d).toISOString().slice(0, 10), quote: x.quote },
    reason: pk ? "accepted at plant level" : x.plantCity && !cityInDoc ? `accepted at company level: ${x.plantCity} is not in the document` : x.plantCity ? `accepted at company level: no known plant in ${x.plantCity}` : "accepted at company level",
  };
}

/** One document often appears on several boards; the same company, plant, type and quote counts once. */
/** Two signals with this key are one observation: the same posting copied to several boards. */
export function signalKey(s: AcceptedSignal): string {
  return `${s.companyKey}|${s.plantKey ?? "-"}|${s.type}|${squash(s.quote)}`;
}

export function dedupeSignals(signals: AcceptedSignal[]): AcceptedSignal[] {
  const seen = new Set<string>();
  const out: AcceptedSignal[] = [];
  for (const s of signals) {
    const k = signalKey(s);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out;
}
