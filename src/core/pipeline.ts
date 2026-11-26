// One run of the engine: read documents, validate signals, score plants, plan outreach per contact
// (channels by law, waterfall within budget, a checked first message) and plan the HubSpot sync.
// The service and the demo call this; the lab runs the same steps inside its designs.

import { AccountStore } from "./accounts/store.ts";
import { CompanyIndex } from "./accounts/resolve.ts";
import { scorePlant, type PlantScore } from "./accounts/score.ts";
import type { PlatformConfig, SellerPlaybook } from "./config.ts";
import { planRequests, planSync, type HubspotCompanyRecord } from "./crm/hubspot.ts";
import { fieldsWanted, runWaterfall, type ProviderClient, type WaterfallResult } from "./enrich/waterfall.ts";
import type { SignalReader } from "./model/readers.ts";
import { decideChannels, sequenceFor, type Channel, type ChannelDecision, type ChannelRules } from "./outreach/channel.ts";
import { checkMessage, type CheckedMessage, type DraftSentence } from "./outreach/message.ts";
import { signalCitation, templateDraft } from "./outreach/template.ts";
import { dedupeSignals, validateSignal } from "./signals/validate.ts";
import type { AcceptedSignal, Company, Contact, Plant, SignalDoc } from "./types.ts";

export interface Drafter {
  draft(signal: AcceptedSignal, plant: Plant, company: Company, contact: Contact): Promise<DraftSentence[]>;
}

export interface PipelineInput {
  docs: SignalDoc[];
  companies: Company[];
  plants: Plant[];
  aliases: Record<string, string>;
  contacts: Contact[];
  suppressed: Set<string>;
  hubspot: HubspotCompanyRecord[];
  accountsToWork: number;
}

export interface ContactPlan {
  contact: { key: string; name: string; role: string; country: string };
  channels: ChannelDecision;
  sequence: Channel[];
  enrichment: WaterfallResult;
  message: CheckedMessage | null;
}

export interface AccountPlan {
  plant: Plant;
  company: Company;
  score: PlantScore;
  signal: AcceptedSignal | null;
  contacts: ContactPlan[];
}

export interface PipelineResult {
  signals: { accepted: AcceptedSignal[]; rejected: { docId: string; company: string; type: string; reason: string }[]; companyLevel: { docId: string; reason: string }[] };
  scores: PlantScore[];
  accounts: AccountPlan[];
  sync: ReturnType<typeof planSync>;
  requests: ReturnType<typeof planRequests>;
  costs: { enrichmentEur: number };
}

export async function runPipeline(
  input: PipelineInput,
  deps: { reader: SignalReader; drafter: Drafter | null; providers: ProviderClient; playbook: SellerPlaybook; channels: ChannelRules; platform: PlatformConfig; store?: AccountStore },
): Promise<PipelineResult> {
  const { playbook, platform } = deps;
  const store = deps.store ?? new AccountStore();
  for (const c of input.companies) store.upsertCompany(c);
  for (const p of input.plants) store.upsertPlant(p);
  for (const c of input.contacts) store.upsertContact(c);
  for (const s of input.suppressed) store.suppress(s, "do not contact", platform.asOf);

  const index = new CompanyIndex(input.companies, input.aliases);
  const plantMap = new Map(input.plants.map((p) => [p.key, p]));
  const evidence = Object.fromEntries(Object.entries(playbook.signals).map(([k, v]) => [k, v.evidence ?? []]));
  const rejected: PipelineResult["signals"]["rejected"] = [];
  const companyLevel: PipelineResult["signals"]["companyLevel"] = [];
  const accepted: AcceptedSignal[] = [];
  for (const doc of input.docs) {
    for (const x of await deps.reader.read(doc)) {
      const v = validateSignal(x, doc, index, plantMap, platform.asOf, playbook.scoring.signalWindowDays, platform.signals.maxQuoteChars, evidence);
      if (!v.accepted) { rejected.push({ docId: doc.id, company: x.company, type: x.type, reason: v.reason }); continue; }
      if (!v.accepted.plantKey) companyLevel.push({ docId: doc.id, reason: v.reason });
      accepted.push(v.accepted);
    }
  }
  const signals = dedupeSignals(accepted);
  for (const s of signals) store.addSignal(s);

  const companyByKey = new Map(input.companies.map((c) => [c.key, c]));
  const scores = input.plants.map((p) => scorePlant(p, companyByKey.get(p.companyKey) as Company, signals, playbook, platform.asOf));
  const ranked = scores.filter((s) => s.tier !== "C").sort((a, b) => b.score - a.score || a.plantKey.localeCompare(b.plantKey)).slice(0, input.accountsToWork);
  const proof = (id: string): string | undefined => playbook.proofPoints.find((p) => p.id === id)?.text;
  const lookup = (cit: string): string | undefined => (cit.startsWith("sig:") ? signals.find((s) => signalCitation(s) === cit)?.quote : proof(cit));

  const accounts: AccountPlan[] = [];
  const enriched: Contact[] = [];
  let enrichmentEur = 0;
  for (const sc of ranked) {
    const plant = plantMap.get(sc.plantKey) as Plant;
    const company = companyByKey.get(plant.companyKey) as Company;
    const signal = signals
      .filter((s) => s.companyKey === company.key && (s.plantKey === plant.key || s.plantKey === null) && playbook.signals[s.type].weight > 0)
      .sort((a, b) => (b.plantKey === plant.key ? 1 : 0) - (a.plantKey === plant.key ? 1 : 0) || playbook.signals[b.type].weight - playbook.signals[a.type].weight || b.date.localeCompare(a.date))[0] ?? null;
    const plans: ContactPlan[] = [];
    const people = input.contacts.filter((c) => c.plantKey === plant.key && playbook.icp.plantRoles.includes(c.role)).slice(0, platform.capacity.contactsPerAccount);
    for (const ct of people) {
      const channels = decideChannels(plant.country, ct.consent, store.isSuppressed(ct.key) || input.suppressed.has(ct.key), deps.channels);
      const seq = sequenceFor(channels);
      const enrichment = runWaterfall({ contactKey: ct.key, country: plant.country }, fieldsWanted(seq), platform.enrichment.providers, playbook.budgetEurPerAccount[sc.tier], platform.enrichment.verifyEmailCostEur, deps.providers);
      enrichmentEur += enrichment.spentEur;
      const updated = { ...ct, email: enrichment.email ?? ct.email, phone: enrichment.phone ?? ct.phone };
      store.upsertContact(updated);
      enriched.push(updated);
      let message: CheckedMessage | null = null;
      if (signal && seq.length > 0) {
        const footer = channels.needsOptOut ? `${playbook.seller.postalAddress}\n${playbook.seller.unsubscribe}` : null;
        const drafted = deps.drafter ? await deps.drafter.draft(signal, plant, company, ct) : templateDraft(signal, proof);
        message = checkMessage(drafted, lookup, platform.claims, playbook.messageNeutral, footer);
        if (!message.sendable) message = checkMessage(templateDraft(signal, proof), lookup, platform.claims, playbook.messageNeutral, footer);
      }
      plans.push({ contact: { key: ct.key, name: ct.name, role: ct.role, country: plant.country }, channels, sequence: seq, enrichment, message });
    }
    accounts.push({ plant, company, score: sc, signal, contacts: plans });
  }

  const scoreMap = new Map(scores.map((s) => [s.plantKey, s]));
  const workedCompanies = input.companies.filter((c) => accounts.some((a) => a.company.key === c.key));
  const workedPlants = accounts.map((a) => a.plant);
  const sync = planSync(workedCompanies, workedPlants, scoreMap, enriched, input.hubspot, (n) => index.resolve(n)?.key ?? null);
  return { signals: { accepted: signals, rejected, companyLevel }, scores, accounts, sync, requests: planRequests(sync), costs: { enrichmentEur: Math.round(enrichmentEur * 100) / 100 } };
}
