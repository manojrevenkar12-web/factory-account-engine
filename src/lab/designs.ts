// Designs compared on the same market and the same luck.
// sdr_manual      today: firmographic list, headquarters contacts, one paid tool, a generic sequence everywhere
// clay_all        enrich every plant of the list with every provider, AI first lines, email everywhere
// model_alone     the model reads the documents, ranks plants, writes and picks the channel itself
// platform        the model reads; code validates signals, scores plants, picks channels by law, runs the
//                 waterfall within budget, checks every sentence and syncs to HubSpot without duplicates
// platform_*      the platform with one safeguard removed

import { CompanyIndex } from "../core/accounts/resolve.ts";
import { scorePlant, type PlantScore } from "../core/accounts/score.ts";
import type { PlatformConfig, SellerPlaybook } from "../core/config.ts";
import { planSync } from "../core/crm/hubspot.ts";
import { fieldsWanted, runWaterfall, type ProviderClient } from "../core/enrich/waterfall.ts";
import { decideChannels, sequenceFor, type Channel, type ChannelRules } from "../core/outreach/channel.ts";
import { checkMessage } from "../core/outreach/message.ts";
import { signalCitation, templateDraft } from "../core/outreach/template.ts";
import { dedupeSignals, validateSignal } from "../core/signals/validate.ts";
import type { AcceptedSignal, Company, ExtractedSignal, Plant, SignalDoc } from "../core/types.ts";
import { u } from "./rng.ts";
import { SimModel } from "./simmodel.ts";
import { illegalTouch, type Market, type WContact, type WPlant, type World } from "./world/world.ts";

export interface DesignSpec {
  name: string;
  kind: "sdr_manual" | "clay_all" | "model_alone" | "platform";
  label: string;
  ablate?: ("company_level" | "validation" | "channel_rules" | "claim_check" | "waterfall")[];
}

export interface Ctx { world: World; playbook: SellerPlaybook; channels: ChannelRules; platform: PlatformConfig; sim: SimModel }

export interface RunResult {
  accountsWorked: number;
  inMarketWorked: number;
  contactsTouched: number;
  touches: number;
  meetings: number;
  qualifiedMeetings: number;
  pipelineEur: number;
  enrichmentEur: number;
  sdrMinutes: number;
  violations: number;
  messages: number;
  unsupportedMessages: number;
  signalsAccepted: number;
  signalsTrue: number;
  crmDuplicates: number;
}

const zero = (): RunResult => ({ accountsWorked: 0, inMarketWorked: 0, contactsTouched: 0, touches: 0, meetings: 0, qualifiedMeetings: 0, pipelineEur: 0, enrichmentEur: 0, sdrMinutes: 0, violations: 0, messages: 0, unsupportedMessages: 0, signalsAccepted: 0, signalsTrue: 0, crmDuplicates: 0 });

const FIT_INDUSTRIES = new Set(["automotive_supplier", "electronics", "machinery", "medical_devices", "appliances", "energy_equipment"]);

/** What the account database knows: companies and plants from a firmographic directory, no hidden truth. */
function accountDb(m: Market): { companies: Company[]; plants: Plant[]; index: CompanyIndex; plantMap: Map<string, Plant> } {
  const companies: Company[] = m.companies.map((c) => ({ key: c.key, name: c.name, domain: c.domain, hqCountry: c.hqCountry, industry: c.industry, employees: c.employees }));
  const plants: Plant[] = m.plants.map((p) => ({ key: p.key, companyKey: p.companyKey, city: p.city, country: p.country, plantType: p.listedType as Plant["plantType"], lines: p.listedLines }));
  return { companies, plants, index: new CompanyIndex(companies, m.knownAliases), plantMap: new Map(plants.map((p) => [p.key, p])) };
}

function providerClient(world: World, m: Market, contacts: Map<string, WContact>): ProviderClient {
  return {
    lookup: (pid, field, t) => { const c = contacts.get(t.contactKey); const v = c ? world.providerLookup(m.seed, c, pid, field) : null; return v ? { value: v } : null; },
    verifyEmail: (_e, t) => contacts.get(t.contactKey)?.emailValid ?? false,
  };
}

/** Reads every document with the simulated model; validates unless the design skips validation. */
function readSignals(ctx: Ctx, m: Market, db: ReturnType<typeof accountDb>, validate: boolean): { accepted: AcceptedSignal[]; raw: ExtractedSignal[] } {
  const raw: ExtractedSignal[] = [];
  for (const d of m.docs) raw.push(...ctx.sim.read(m, d));
  const docs = new Map<string, SignalDoc>(m.docs.map((d) => [d.id, { id: d.id, source: d.source, publishedAt: d.publishedAt, text: d.text }]));
  const accepted: AcceptedSignal[] = [];
  for (const x of raw) {
    if (validate) {
      const v = validateSignal(x, docs.get(x.docId), db.index, db.plantMap, ctx.platform.asOf, ctx.playbook.scoring.signalWindowDays, ctx.platform.signals.maxQuoteChars, evidenceTerms(ctx));
      if (v.accepted) accepted.push(v.accepted);
    } else {
      const c = db.index.resolve(x.company);
      if (!c) continue;
      const pk = x.plantCity ? `${c.key}#${x.plantCity.toLowerCase().replace(/[^a-z0-9]+/g, "-")}` : null;
      accepted.push({ docId: x.docId, companyKey: c.key, plantKey: pk && db.plantMap.has(pk) ? pk : null, type: x.type as AcceptedSignal["type"], date: x.date, quote: x.quote });
    }
  }
  return { accepted: validate ? dedupeSignals(accepted) : accepted, raw };
}

function evidenceTerms(ctx: Ctx): Partial<Record<AcceptedSignal["type"], string[]>> {
  return Object.fromEntries(Object.entries(ctx.playbook.signals).map(([k, v]) => [k, v.evidence ?? []]));
}

function signalIsTrue(m: Market, s: AcceptedSignal): boolean {
  const doc = m.docs.find((d) => d.id === s.docId);
  return !!doc && doc.truth.companyKey === s.companyKey && (s.plantKey === null || doc.truth.plantKey === s.plantKey) && doc.truth.type === s.type && doc.text.includes(s.quote);
}

interface Target { plant: WPlant; contacts: WContact[]; viaHq: boolean; signal: AcceptedSignal | null }

function work(ctx: Ctx, m: Market, spec: DesignSpec, targets: Target[], res: RunResult, opts: {
  channels: (c: WContact) => Channel[];
  enrich: (c: WContact, allowed: Channel[], tierBudget: number) => { email: string | null; phone: string | null; spent: number };
  message: (c: WContact, t: Target) => { relevance: "plantSignal" | "generic" | "wrong"; unsupported: boolean } | null;
  researchMinutes: number;
  budget: (t: Target) => number;
}): void {
  const costs = ctx.platform.costs;
  const companyPlants = new Map<string, WPlant[]>();
  for (const p of m.plants) companyPlants.set(p.companyKey, [...(companyPlants.get(p.companyKey) ?? []), p]);
  for (const t of targets) {
    res.accountsWorked++;
    if (t.plant.inMarket) res.inMarketWorked++;
    res.sdrMinutes += opts.researchMinutes;
    let booked = false;
    for (const c of t.contacts) {
      const allowed = opts.channels(c);
      const found = opts.enrich(c, allowed, opts.budget(t));
      res.enrichmentEur += found.spent;
      const usable = allowed.filter((ch) => (ch === "email" ? !!found.email : ch === "phone" ? !!found.phone : true));
      if (usable.length === 0) continue;
      res.contactsTouched++;
      const msg = opts.message(c, t);
      if (msg) { res.messages++; if (msg.unsupported) res.unsupportedMessages++; }
      for (let step = 0; step < usable.length; step++) {
        const ch = usable[step] as Channel;
        res.touches++;
        res.sdrMinutes += costs.minutesPerTouch[ch];
        const illegal = illegalTouch(ctx.world.cfg, c, ch);
        if (illegal) res.violations++;
        const r = ctx.world.respond(m.seed, c, t.viaHq ? null : t.plant, companyPlants.get(c.companyKey) ?? [], ch, msg?.relevance ?? "generic", illegal && ch === "email", step);
        if (r.reply) {
          if (r.meeting && !booked) {
            booked = true;
            res.meetings++;
            const target = t.viaHq ? ((companyPlants.get(c.companyKey) ?? []).find((p) => p.inMarket) ?? (companyPlants.get(c.companyKey) ?? []).find((p) => p.need) ?? null) : t.plant;
            if (target?.need) { res.qualifiedMeetings++; res.pipelineEur += ctx.world.pipelineEur(target, t.viaHq); }
          }
          break;
        }
      }
    }
  }
}

function crmDuplicates(m: Market, companyKeys: Set<string>, dedupe: "fae" | "domain" | "exact_name"): number {
  let dup = 0;
  if (dedupe === "fae") {
    const companies = m.companies.filter((c) => companyKeys.has(c.key)).map((c) => ({ key: c.key, name: c.name, domain: c.domain, hqCountry: c.hqCountry, industry: c.industry, employees: c.employees }));
    const index = new CompanyIndex(companies.length ? m.companies.map((c) => ({ key: c.key, name: c.name, domain: c.domain, hqCountry: c.hqCountry, industry: c.industry, employees: c.employees })) : [], m.knownAliases);
    const plan = planSync(companies, [], new Map(), [], m.hubspot.map((h) => ({ id: h.id, name: h.name, domain: h.domain, fae_account_key: null })), (n) => index.resolve(n)?.key ?? null);
    const matched = new Set(plan.keyAttachments.map((a) => m.hubspot.find((h) => h.id === a.hubspotId)?.truthCompanyKey));
    for (const h of m.hubspot) if (companyKeys.has(h.truthCompanyKey) && !matched.has(h.truthCompanyKey)) dup++;
    return dup;
  }
  for (const h of m.hubspot) {
    if (!companyKeys.has(h.truthCompanyKey)) continue;
    const c = m.companies.find((x) => x.key === h.truthCompanyKey);
    if (!c) continue;
    const match = dedupe === "domain" ? h.domain?.replace(/^www\./, "") === c.domain : h.name === c.name;
    if (!match) dup++;
  }
  return dup;
}

export function runDesign(spec: DesignSpec, m: Market, ctx: Ctx): RunResult {
  const res = zero();
  const db = accountDb(m);
  const contactsByKey = new Map(m.contacts.map((c) => [c.key, c]));
  const client = providerClient(ctx.world, m, contactsByKey);
  const K = ctx.platform.capacity.accountsPerMonth;
  const providers = ctx.platform.enrichment.providers;
  const verify = ctx.platform.enrichment.verifyEmailCostEur;
  const proof = (id: string): string | undefined => ctx.playbook.proofPoints.find((p) => p.id === id)?.text;
  const plantsOf = (companyKey: string): WPlant[] => m.plants.filter((p) => p.companyKey === companyKey);
  const contactsAt = (plantKey: string | null, companyKey: string, roles: string[]): WContact[] =>
    roles.map((r) => m.contacts.find((c) => c.companyKey === companyKey && c.role === r && c.plantKey === (r === "vp_operations" ? null : plantKey))).filter((c): c is WContact => !!c);
  const ablate = new Set(spec.ablate ?? []);

  if (spec.kind === "sdr_manual" || spec.kind === "clay_all") {
    const listed = m.companies.filter((c) => FIT_INDUSTRIES.has(c.industry) && c.employees >= 500 && c.hqCountry !== "France");
    let targets: Target[];
    if (spec.kind === "sdr_manual") {
      targets = listed.map((c) => ({ c, r: u("sdr-order", m.seed, c.key) })).sort((a, b) => a.r - b.r).slice(0, K).map(({ c }) => {
        const hqPlant = plantsOf(c.key)[0] as WPlant;
        return { plant: hqPlant, contacts: contactsAt(hqPlant.key, c.key, ["vp_operations", "plant_manager"]), viaHq: true, signal: null };
      });
    } else {
      // Score plants by how many documents mention the company's exact name: no reading, no validation.
      const mentions = new Map<string, number>();
      for (const d of m.docs) for (const c of listed) if (d.text.startsWith(c.name)) mentions.set(c.key, (mentions.get(c.key) ?? 0) + 1);
      targets = listed.flatMap((c) => plantsOf(c.key).map((p) => ({ p, s: (mentions.get(c.key) ?? 0) + u("clay-order", m.seed, p.key) })))
        .sort((a, b) => b.s - a.s).slice(0, K)
        .map(({ p }) => ({ plant: p, contacts: contactsAt(p.key, p.companyKey, ["plant_manager", "head_industrial_engineering", "lean_manager", "production_manager"]), viaHq: false, signal: null }));
    }
    const allProviders = (c: WContact): { email: string | null; phone: string | null; spent: number } => {
      let email: string | null = null, phone: string | null = null, spent = 0;
      for (const p of providers) for (const f of p.fields) {
        spent += p.costEur + (f === "email" ? verify : 0);
        const v = client.lookup(p.id, f, { contactKey: c.key, country: c.country });
        if (v && f === "email" && !email && c.emailValid) email = v.value;
        if (v && f === "phone" && !phone) phone = v.value;
      }
      return { email, phone, spent };
    };
    work(ctx, m, spec, targets, res, {
      channels: () => ["email", "phone"],
      enrich: (c) => {
        if (spec.kind === "clay_all") return allProviders(c);
        const pc = providers.find((p) => p.id === "pool_c") as (typeof providers)[number];
        const e = client.lookup(pc.id, "email", { contactKey: c.key, country: c.country });
        const ph = client.lookup(pc.id, "phone", { contactKey: c.key, country: c.country });
        return { email: e && c.emailValid ? e.value : null, phone: ph?.value ?? null, spent: 2 * pc.costEur };
      },
      message: (c, t) => {
        if (spec.kind === "sdr_manual") return { relevance: "generic", unsupported: false };
        const wrongCity = plantsOf(t.plant.companyKey).find((p) => p.key !== t.plant.key)?.city ?? "Dallas";
        const dr = ctx.sim.draft(m.seed, c.key, `${t.plant.city} plant`, "sig:none", wrongCity, "pp-cycle", proof("pp-cycle") ?? "", "Saw your news");
        return { relevance: dr.kind === "correct" ? "generic" : "wrong", unsupported: dr.kind !== "correct" };
      },
      researchMinutes: spec.kind === "sdr_manual" ? ctx.platform.costs.minutesManualResearchPerAccount : ctx.platform.costs.minutesReviewPerAccount,
      budget: () => Infinity,
    });
    res.crmDuplicates = crmDuplicates(m, new Set(targets.map((t) => t.plant.companyKey)), spec.kind === "clay_all" ? "domain" : "exact_name");
    return res;
  }

  // ---- designs that read the documents ----
  const validate = spec.kind === "platform" && !ablate.has("validation");
  const { accepted } = readSignals(ctx, m, db, validate);
  res.signalsAccepted = accepted.length;
  res.signalsTrue = accepted.filter((s) => signalIsTrue(m, s)).length;
  const companyByKey = new Map(db.companies.map((c) => [c.key, c]));
  const wplant = new Map(m.plants.map((p) => [p.key, p]));

  let ranked: { plant: WPlant; score: PlantScore | null }[];
  if (spec.kind === "model_alone") {
    const count = new Map<string, number>();
    for (const s of accepted) if (s.plantKey && s.type !== "closure" && s.type !== "hiring_freeze") count.set(s.plantKey, (count.get(s.plantKey) ?? 0) + 1);
    ranked = m.plants.map((p) => ({ plant: p, score: null, s: (count.get(p.key) ?? 0) + (FIT_INDUSTRIES.has(companyByKey.get(p.companyKey)?.industry ?? "") ? 0.5 : 0) + 0.5 * u("alone-rank", m.seed, p.key) }))
      .sort((a, b) => b.s - a.s).map(({ plant, score }) => ({ plant, score }));
  } else {
    const scores = db.plants.map((p) => scorePlant(p, companyByKey.get(p.companyKey) as Company, accepted, ctx.playbook, ctx.platform.asOf));
    ranked = scores.filter((s) => s.tier !== "C").sort((a, b) => b.score - a.score || a.plantKey.localeCompare(b.plantKey)).map((s) => ({ plant: wplant.get(s.plantKey) as WPlant, score: s }));
  }

  const bestSignal = (plantKey: string, companyKey: string): AcceptedSignal | null =>
    accepted.filter((s) => s.companyKey === companyKey && (s.plantKey === plantKey || s.plantKey === null) && s.type !== "closure" && s.type !== "hiring_freeze")
      .sort((a, b) => (b.plantKey === plantKey ? 1 : 0) - (a.plantKey === plantKey ? 1 : 0)
        || ctx.playbook.signals[b.type].weight - ctx.playbook.signals[a.type].weight
        || b.date.localeCompare(a.date))[0] ?? null;

  const companyLevel = ablate.has("company_level");
  const seenCompany = new Set<string>();
  const targets: Target[] = [];
  for (const r of ranked) {
    if (targets.length >= K) break;
    if (companyLevel) {
      if (seenCompany.has(r.plant.companyKey)) continue;
      seenCompany.add(r.plant.companyKey);
      const hq = plantsOf(r.plant.companyKey)[0] as WPlant;
      targets.push({ plant: r.plant, contacts: contactsAt(hq.key, r.plant.companyKey, ["vp_operations", "plant_manager"]), viaHq: true, signal: bestSignal(r.plant.key, r.plant.companyKey) });
    } else {
      targets.push({ plant: r.plant, contacts: contactsAt(r.plant.key, r.plant.companyKey, ["head_industrial_engineering", "plant_manager"]), viaHq: false, signal: bestSignal(r.plant.key, r.plant.companyKey) });
    }
  }
  const tierOf = new Map(ranked.map((r) => [r.plant.key, r.score?.tier ?? "B"]));

  work(ctx, m, spec, targets, res, {
    channels: (c) => {
      if (spec.kind === "model_alone") return ctx.sim.aloneFollowsLaw(m.seed, c.key) ? decideChannels(c.country, c.consent, m.suppression.includes(c.key), ctx.channels).allowed : ["email", "phone"];
      if (ablate.has("channel_rules")) return ["email", "phone"];
      return sequenceFor(decideChannels(c.country, c.consent, m.suppression.includes(c.key), ctx.channels));
    },
    enrich: (c, allowed, budget) => {
      if (spec.kind === "model_alone") {
        const e = client.lookup("pool_c", "email", { contactKey: c.key, country: c.country });
        return { email: e && c.emailValid ? e.value : null, phone: null, spent: 1.1 };
      }
      if (ablate.has("waterfall")) {
        let email: string | null = null, phone: string | null = null, spent = 0;
        for (const p of providers) for (const f of p.fields) {
          spent += p.costEur + (f === "email" ? verify : 0);
          const v = client.lookup(p.id, f, { contactKey: c.key, country: c.country });
          if (v && f === "email" && !email && c.emailValid) email = v.value;
          if (v && f === "phone" && !phone) phone = v.value;
        }
        return { email, phone, spent };
      }
      const w = runWaterfall({ contactKey: c.key, country: c.country }, fieldsWanted(allowed), providers, budget, verify, client);
      return { email: w.email, phone: w.phone, spent: w.spentEur };
    },
    message: (c, t) => {
      const s = t.signal;
      if (!s) return { relevance: "generic", unsupported: false };
      const lead = s.type.endsWith("_hiring") ? "Saw your posting" : "Read the announcement";
      const ppId = s.type === "new_line" || s.type === "plant_expansion" ? "pp-ramp" : s.type === "ie_hiring" ? "pp-ie" : s.type === "reshoring_us" ? "pp-setup" : "pp-cycle";
      const wrongCity = plantsOf(t.plant.companyKey).find((p) => p.key !== t.plant.key)?.city ?? "Dallas";
      const dr = ctx.sim.draft(m.seed, c.key, s.quote, signalCitation(s), wrongCity, ppId, proof(ppId) ?? "", lead);
      const doc = m.docs.find((d) => d.id === s.docId);
      const invented = !doc || !doc.text.includes(s.quote);
      const trueSignal = signalIsTrue(m, s) && doc?.truth.plantKey === t.plant.key;
      const goodRelevance = invented ? "wrong" : trueSignal ? "plantSignal" : "generic";
      const check = spec.kind === "platform" && !ablate.has("claim_check");
      if (!check) return { relevance: dr.kind === "correct" ? goodRelevance : "wrong", unsupported: dr.kind !== "correct" || invented };
      const lookup = (cit: string): string | undefined => (cit.startsWith("sig:") ? accepted.find((a) => signalCitation(a) === cit)?.quote : proof(cit));
      const checked = checkMessage(dr.draft, lookup, ctx.platform.claims, ctx.playbook.messageNeutral, null);
      const factsDropped = checked.sentences.some((x) => !x.kept);
      // The claim check compares with the accepted quote; it cannot know the quote itself was invented.
      if (checked.sendable && !factsDropped) return { relevance: goodRelevance, unsupported: invented };
      // The check failed: fall back to the deterministic template, which quotes the signal verbatim.
      const fallback = checkMessage(templateDraft(s, proof), lookup, ctx.platform.claims, ctx.playbook.messageNeutral, null);
      return fallback.sendable ? { relevance: goodRelevance, unsupported: invented } : { relevance: "generic", unsupported: false };
    },
    researchMinutes: ctx.platform.costs.minutesReviewPerAccount,
    budget: (t) => ctx.playbook.budgetEurPerAccount[(tierOf.get(t.plant.key) ?? "B") as "A" | "B" | "C"],
  });
  res.crmDuplicates = crmDuplicates(m, new Set(targets.map((t) => t.plant.companyKey)), spec.kind === "platform" ? "fae" : "exact_name");
  return res;
}
