// The simulated market: companies, their plants and each plant's hidden need and timing, the documents
// the outside world publishes about them, the contacts behind them, an existing HubSpot, and how buyers
// respond. Designs act on it; only the scorer reads the truth. It imports nothing from src/core.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Stream, u, weightedBy } from "../rng.ts";

export const ROOT = new URL("../../../", import.meta.url).pathname;

export type WSignalType = "ie_hiring" | "lean_hiring" | "assembler_hiring" | "new_line" | "plant_expansion" | "reshoring_us" | "closure" | "hiring_freeze";
export type WRole = "plant_manager" | "head_industrial_engineering" | "lean_manager" | "production_manager" | "vp_operations";
export type WChannel = "email" | "phone" | "linkedin" | "letter";

export interface WCompany { key: string; name: string; aliases: string[]; domain: string; hqCountry: string; hqCity: string; industry: string; employees: number }
export interface WPlant {
  key: string; companyKey: string; city: string; country: string;
  /** What a firmographic directory shows: sometimes missing. */
  listedType: string | null; listedLines: number | null;
  /** Hidden truth. */
  trueType: string; trueLines: number; manualIntensity: number; need: boolean; inMarket: boolean; closed: boolean;
}
export interface WDoc { id: string; source: "jobboard" | "press"; publishedAt: string; text: string; truth: { companyKey: string; plantKey: string; type: WSignalType; quote: string; nameUsed: string; cityUsed: string } }
export interface WContact {
  key: string; companyKey: string; plantKey: string | null; role: WRole; name: string; country: string;
  email: string | null; emailValid: boolean; phone: string | null;
  consent: { express: string | null; presumed: string | null }; suppressed: boolean;
}
export interface WHubspotRecord { id: string; name: string; domain: string | null; fae_account_key: null; truthCompanyKey: string }

export interface Market {
  seed: number;
  companies: WCompany[];
  plants: WPlant[];
  docs: WDoc[];
  contacts: WContact[];
  hubspot: WHubspotRecord[];
  /** Variant names the account database already maps to a company (the rest are unknown to it). */
  knownAliases: Record<string, string>;
  /** Do-not-contact list kept in the CRM, by person. */
  suppression: string[];
}

export type WorldConfig = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const CITIES: Record<string, string[]> = {
  Germany: ["Regensburg", "Nuremberg", "Stuttgart", "Ingolstadt", "Chemnitz", "Bielefeld", "Augsburg", "Kassel", "Erlangen", "Dresden", "Paderborn", "Ulm", "Wolfsburg", "Schweinfurt", "Heilbronn"],
  "United States": ["Greenville", "Spartanburg", "Dayton", "Fort Worth", "Knoxville", "Huntsville", "Grand Rapids", "Toledo", "Chattanooga", "Columbus"],
  Austria: ["Linz", "Graz", "Steyr", "Wels"],
  Switzerland: ["Winterthur", "Aarau", "Baar", "Zug"],
  Poland: ["Wroclaw", "Katowice", "Gliwice", "Poznan"],
  Czechia: ["Plzen", "Brno", "Mlada Boleslav", "Ostrava"],
  "United Kingdom": ["Coventry", "Derby", "Swindon", "Sunderland"],
  Mexico: ["Queretaro", "Saltillo", "Monterrey", "Puebla"],
  France: ["Lyon", "Toulouse", "Valenciennes", "Strasbourg"],
};
const GERMAN = new Set(["Germany", "Austria", "Switzerland"]);
const SUFFIX: Record<string, string[]> = { Germany: ["GmbH", "AG", "SE", "GmbH & Co. KG"], Austria: ["GmbH", "AG"], Switzerland: ["AG"], "United States": ["Inc.", "LLC", "Corp."], Poland: ["Sp. z o.o."], Czechia: ["s.r.o."], "United Kingdom": ["Ltd", "plc"], Mexico: ["S.A."], France: ["SAS", "SA"] };
const STEMS = ["Brenner", "Halder", "Kessler", "Lindauer", "Marquardt", "Nordtal", "Ostwerk", "Pfalzer", "Rothenberg", "Sandner", "Trautwein", "Vogtland", "Westhoff", "Zeller", "Arnold", "Baxter", "Carver", "Dunmore", "Ellison", "Fairbank", "Granger", "Holloway", "Ingram", "Jessup"];
const WORDS: Record<string, string[]> = {
  automotive_supplier: ["Automotive", "Fahrzeugtechnik", "Drive Systems"], electronics: ["Elektronik", "Electronics", "Sensorik"], medical_devices: ["Medizintechnik", "Medical"],
  machinery: ["Maschinenbau", "Machinery"], appliances: ["Hausgeräte", "Appliances"], energy_equipment: ["Energietechnik", "Power Systems"], aerospace: ["Aerostructures"],
  process_chemicals: ["Chemie", "Polymers"], food_beverage: ["Foods", "Getränke"], logistics: ["Logistik", "Logistics"],
};
const FIRST = ["Anna", "Jonas", "Lea", "Tim", "Sofia", "Lukas", "Mia", "Felix", "Emma", "Paul", "Olivia", "Noah", "Ava", "Liam", "Marta", "Jan", "Petra", "Tomas"];
const LAST = ["Becker", "Wolf", "Krause", "Hoffmann", "Schulz", "Nowak", "Novak", "Miller", "Brown", "Garcia", "Davis", "Keller", "Huber", "Lang", "Moore", "Clark"];
const PLANT_ROLES: WRole[] = ["plant_manager", "head_industrial_engineering", "lean_manager", "production_manager"];

function text(type: WSignalType, company: string, city: string, german: boolean, s: Stream): string {
  const n = s.int(12, 45);
  if (german) {
    switch (type) {
      case "ie_hiring": return `${company} sucht Industrial Engineer (m/w/d) für Zeitstudien nach REFA im Werk ${city}. Sie analysieren Taktzeiten an manuellen Montagelinien.`;
      case "lean_hiring": return `${company} sucht Lean Manager (m/w/d) für das Werk ${city}. Sie treiben den kontinuierlichen Verbesserungsprozess.`;
      case "assembler_hiring": return `${company} sucht ${n} Montagemitarbeiter (m/w/d) im Werk ${city}. Schichtbetrieb an der Endmontage.`;
      case "new_line": return `${company} nimmt im Werk ${city} eine neue Montagelinie in Betrieb. Der Anlauf beginnt im kommenden Quartal.`;
      case "plant_expansion": return `${company} erweitert das Werk ${city} um eine neue Montagehalle. Rund ${n} neue Arbeitsplätze entstehen.`;
      case "reshoring_us": return `${company} verlagert Produktion in das Werk ${city}.`;
      case "closure": return `${company} schließt das Werk ${city} bis Ende 2027. Die Produktion wird verlagert.`;
      case "hiring_freeze": return `${company} kündigt Kurzarbeit im Werk ${city} an. Neueinstellungen sind ausgesetzt.`;
    }
  }
  switch (type) {
    case "ie_hiring": return `${company} is hiring an Industrial Engineer for time studies (MTM) at its ${city} plant. The role analyses cycle times on manual assembly lines.`;
    case "lean_hiring": return `${company} is hiring a Continuous Improvement Lead for its ${city} plant. The role leads kaizen events on the assembly floor.`;
    case "assembler_hiring": return `${company} is hiring ${n} assembly technicians at its ${city} plant. Second and third shift.`;
    case "new_line": return `${company} will start a new assembly line at its ${city} plant. Ramp-up starts next quarter.`;
    case "plant_expansion": return `${company} announced an expansion of its ${city} plant. About ${n} jobs will be added.`;
    case "reshoring_us": return `${company} is moving production from Asia to its ${city} plant. The move adds a final assembly area.`;
    case "closure": return `${company} will close its ${city} plant by the end of 2027. Production moves to other sites.`;
    case "hiring_freeze": return `${company} announced a hiring freeze at its ${city} plant. Overtime is cut as orders slow.`;
  }
}

/** The world's own sentence split: a legal form such as "Co. KG" or "Inc." does not end a sentence. */
function firstSentence(body: string): string {
  const re = /\.\s(?=[A-ZÄÖÜ0-9])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    const before = body.slice(0, m.index);
    if (!/\b(?:Co|Inc|Corp|Ltd)$/.test(before)) return body.slice(0, m.index + 1);
  }
  return body;
}

export class World {
  readonly cfg: WorldConfig;

  constructor(root = ROOT) {
    this.cfg = JSON.parse(readFileSync(join(root, "config/lab/world.json"), "utf8")) as WorldConfig;
  }

  market(seed: number): Market {
    const c = this.cfg;
    const s = new Stream(`market:${seed}`);
    const companies: WCompany[] = [];
    const plants: WPlant[] = [];
    const docs: WDoc[] = [];
    const contacts: WContact[] = [];
    const hubspot: WHubspotRecord[] = [];
    const knownAliases: Record<string, string> = {};
    const suppression: string[] = [];
    const usedNames = new Set<string>();
    const asOf = Date.parse(c.asOf);
    const day = (d: number): string => new Date(asOf - d * 86_400_000).toISOString().slice(0, 10);

    for (let i = 0; i < c.companiesPerSeed; i++) {
      const industry = s.weighted(c.industries as Record<string, number>);
      const hqCountry = s.weighted(c.hqCountry as Record<string, number>);
      let base = "";
      for (let tries = 0; tries < 20; tries++) {
        base = `${s.pick(STEMS)} ${s.pick(WORDS[industry] as string[])}`;
        if (!usedNames.has(base)) break;
        base = `${base} ${i}`;
      }
      usedNames.add(base);
      const suffix = s.pick(SUFFIX[hqCountry] ?? ["Ltd"]);
      const name = `${base} ${suffix}`;
      const key = `${base.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.example`;
      const employees = Math.max(80, Math.round(s.logNormal(1400, 1.0)));
      const hqCity = s.pick(CITIES[hqCountry] as string[]);
      const aliases = [base, `${base} ${s.pick(SUFFIX[hqCountry] ?? ["Ltd"])}`, base.split(" ").map((w) => w[0]).join("").toUpperCase() + (s.next() < 0.5 ? "" : " Group")];
      const company: WCompany = { key, name, aliases, domain: key, hqCountry, hqCity, industry, employees };
      companies.push(company);
      for (const a of aliases) if (s.next() < c.signalRates.variantKnownInAccountDb) knownAliases[a] = key;

      const nPlants = Math.max(1, Math.min(7, Math.round(employees / 900 + s.next() * 2)));
      const cities = new Set<string>();
      for (let p = 0; p < nPlants; p++) {
        const shift = s.weighted(c.plantCountryShift as Record<string, number>);
        const country = p === 0 || shift === "same" ? hqCountry : shift;
        const city = p === 0 ? hqCity : s.pick(CITIES[country] as string[]);
        if (cities.has(`${country}|${city}`)) continue;
        cities.add(`${country}|${city}`);
        const trueType = s.weighted(c.plantType as Record<string, number>);
        const trueLines = Math.max(1, Math.round(s.logNormal(5, 0.6)));
        const manualIntensity = trueType === "manual_assembly" ? 0.6 + 0.4 * s.next() : trueType === "mixed_assembly" ? 0.3 + 0.4 * s.next() : 0.2 * s.next();
        const fitInd = c.trueIndustryFit[industry] as number;
        const need = manualIntensity >= c.need.minManualIntensity && trueLines >= c.need.minLines && fitInd >= c.need.minIndustryFit;
        const closed = s.next() < c.signalRates.closure;
        const inMarket = need && !closed && s.next() < c.need.inMarketShare;
        const pk = `${key}#${city.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
        plants.push({
          key: pk, companyKey: key, city, country,
          listedType: s.next() < c.directory.plantTypeKnown ? trueType : null,
          listedLines: s.next() < c.directory.linesKnown ? trueLines : null,
          trueType, trueLines, manualIntensity, need, inMarket, closed,
        });

        // Documents the outside world publishes about this plant.
        const rates = inMarket ? c.signalRates.inMarket : need ? c.signalRates.needNotInMarket : c.signalRates.noNeed;
        const emit = (type: WSignalType, recent: boolean): void => {
          const nameUsed = s.next() < c.signalRates.nameVariant ? s.pick(aliases) : name;
          const cityUsed = (type.endsWith("_hiring") && s.next() < c.signalRates.postingUsesHqCity) ? hqCity : city;
          const body = text(type, nameUsed, cityUsed, GERMAN.has(country), s);
          const quote = firstSentence(body);
          const age = recent ? s.int(3, 80) : s.int(20, 420);
          const id = `d${seed}-${docs.length}`;
          const doc: WDoc = { id, source: type.endsWith("_hiring") ? "jobboard" : "press", publishedAt: day(age), text: body, truth: { companyKey: key, plantKey: pk, type, quote, nameUsed, cityUsed } };
          docs.push(doc);
          if (type.endsWith("_hiring") && s.next() < c.signalRates.duplicatePostings) docs.push({ ...doc, id: `${id}b` });
        };
        for (const [type, p] of Object.entries(rates as Record<string, number>)) {
          if (type === "reshoring_us" && country !== "United States") continue;
          if (s.next() < p) emit(type as WSignalType, inMarket);
        }
        if (closed) emit("closure", true);
        if (s.next() < c.signalRates.hiringFreeze) emit("hiring_freeze", s.next() < 0.5);

        // People at the plant.
        for (const role of PLANT_ROLES) contacts.push(this.contact(s, key, pk, role, country, `${role}-${pk}`, suppression));
      }
      contacts.push(this.contact(s, key, null, "vp_operations", hqCountry, `vp-${key}`, suppression));

      if (s.next() < c.crm.existingRecordShare) {
        hubspot.push({ id: `hs-${seed}-${i}`, name: s.pick(aliases), domain: s.next() < c.crm.existingHasDomain ? `www.${key}` : null, fae_account_key: null, truthCompanyKey: key });
      }
    }
    return { seed, companies, plants, docs, contacts, hubspot, knownAliases, suppression };
  }

  private contact(s: Stream, companyKey: string, plantKey: string | null, role: WRole, country: string, key: string, suppression: string[]): WContact {
    const c = this.cfg.contacts;
    const first = s.pick(FIRST);
    const last = s.pick(LAST);
    const emailExists = s.next() < (c.emailExists[country] ?? c.emailExists.default);
    const email = emailExists ? `${first}.${last}@${companyKey}`.toLowerCase() : null;
    const r = s.next();
    const consent = { express: r < c.expressConsent ? "webinar_opt_in" : null, presumed: r >= c.expressConsent && r < c.expressConsent + c.presumedConsent ? "met_in_person" : null };
    const suppressed = s.next() < c.suppressed;
    if (suppressed) suppression.push(key);
    return { key, companyKey, plantKey, role, name: `${first} ${last}`, country, email, emailValid: s.next() < c.emailValid, phone: s.next() < c.phoneExists ? `+00 ${s.int(100000, 999999)}` : null, consent, suppressed };
  }

  // ---- services: same answer for every design ----

  providerLookup(seed: number, contact: WContact, providerId: string, field: "email" | "phone"): string | null {
    const value = field === "email" ? contact.email : contact.phone;
    if (!value) return null;
    const rates = this.cfg.providers[providerId] as Record<string, number> | undefined;
    if (!rates) return null;
    const p = rates[contact.country] ?? rates.default ?? 0;
    return u("provider", seed, contact.key, providerId, field) < p ? value : null;
  }

  /** Does this person reply to this touch, and book a meeting? */
  respond(seed: number, contact: WContact, plant: WPlant | null, companyPlants: WPlant[], channel: WChannel, relevance: "plantSignal" | "generic" | "wrong", illegal: boolean, step: number): { reply: boolean; meeting: boolean } {
    const r = this.cfg.response;
    const target = plant ?? companyPlants.find((p) => p.inMarket) ?? companyPlants.find((p) => p.need) ?? null;
    const needF = target?.inMarket ? r.needInMarket : target?.need ? r.needNotInMarket : r.noNeed;
    const roleF = contact.plantKey ? r.role.plant : r.role.hq;
    let p = r.base[channel] * needF * r.relevance[relevance] * roleF * (illegal ? r.illegalEmailPenalty : 1);
    if (channel === "email" && !contact.emailValid) p = 0;
    if (target?.closed) p *= 0.1;
    const reply = u("reply", seed, contact.key, step, channel) < Math.min(0.9, p);
    const meeting = reply && u("meeting", seed, contact.key, step) < (target?.need ? r.meetingGivenReply.need : r.meetingGivenReply.noNeed);
    return { reply, meeting };
  }

  pipelineEur(plant: WPlant | null, viaHq: boolean): number {
    if (!plant || !plant.need) return 0;
    const v = this.cfg.deal.opportunityRate * plant.trueLines * this.cfg.deal.acvEurPerLine;
    return viaHq ? v * this.cfg.response.hqHandoffLoss : v;
  }
}

export function weighted<T extends string>(x: number, w: Record<T, number>): T { return weightedBy(x, w); }

/** Whether a first touch on this channel breaks the law in the contact's country, by the world's own rules. */
export function illegalTouch(cfg: WorldConfig, contact: WContact, channel: WChannel): boolean {
  if (contact.suppressed) return true;
  const law = cfg.law as { email: Record<string, string>; phone: Record<string, string> };
  if (channel === "email") {
    const rule = law.email[contact.country] ?? "express";
    return rule === "express" && contact.consent.express === null;
  }
  if (channel === "phone") {
    const rule = law.phone[contact.country] ?? "express";
    if (rule === "express") return contact.consent.express === null;
    if (rule === "presumed") return contact.consent.express === null && contact.consent.presumed === null;
  }
  return false;
}
