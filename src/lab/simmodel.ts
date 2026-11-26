// The simulated model: it reads each document and drafts first-touch sentences, with errors at the rates
// in world.json. The same document or contact always gets the same error, whichever design asks.

import type { ExtractedSignal } from "../core/types.ts";
import type { DraftSentence } from "../core/outreach/message.ts";
import { u } from "./rng.ts";
import type { Market, WDoc, World } from "./world/world.ts";

const TYPES = ["ie_hiring", "lean_hiring", "assembler_hiring", "new_line", "plant_expansion", "reshoring_us", "closure", "hiring_freeze"];

export class SimModel {
  private readonly r: Record<string, number>;
  calls = 0;

  constructor(world: World) {
    this.r = world.cfg.reader as Record<string, number>;
  }

  private p(k: string): number {
    const v = this.r[k];
    if (v === undefined) throw new Error(`reader rate ${k} missing`);
    return v;
  }

  read(m: Market, doc: WDoc): ExtractedSignal[] {
    this.calls++;
    const t = doc.truth;
    const d = (k: string): number => u("read", m.seed, doc.id, k);
    const hq = m.companies.find((c) => c.key === t.companyKey)?.hqCity ?? t.cityUsed;
    const base: ExtractedSignal = { docId: doc.id, company: t.nameUsed, plantCity: t.cityUsed, country: null, type: t.type, date: doc.publishedAt, quote: t.quote };
    const out: ExtractedSignal[] = [];
    const x = d("kind");
    if (x < this.p("extractCorrect")) out.push(base);
    else if (x < this.p("extractCorrect") + this.p("cityUsesHq")) out.push({ ...base, plantCity: hq });
    else out.push({ ...base, type: TYPES[Math.floor(d("type") * TYPES.length)] as string });
    if (d("invent") < this.p("inventSignal")) {
      const fake = d("fake") < this.p("inventedQuoteNotInDoc");
      out.push({ ...base, type: "new_line", quote: fake ? `${t.nameUsed} opens a new assembly line in ${t.cityUsed}` : t.quote });
    }
    return out;
  }

  /** A first-touch draft about one signal. Returns what kind of draft it was, for the scorer only. */
  draft(seed: number, contactKey: string, quote: string, signalCitation: string, wrongCity: string, proofId: string, proofText: string, lead: string): { draft: DraftSentence[]; kind: "correct" | "wrong_place" | "invented_number" } {
    this.calls++;
    const x = u("draft", seed, contactKey);
    const ask: DraftSentence = { kind: "ask", text: "Would a short call with your team next week be useful?", citation: null };
    const opener: DraftSentence = { kind: "fact", text: `${lead}: "${quote.replace(/[.\s]+$/, "")}".`, citation: signalCitation };
    if (x < this.p("draftCorrect")) return { draft: [opener, { kind: "fact", text: proofText, citation: proofId }, ask], kind: "correct" };
    if (x < this.p("draftCorrect") + this.p("draftWrongPlace")) {
      return { draft: [{ kind: "fact", text: `Congratulations on the new line in ${wrongCity}.`, citation: signalCitation }, { kind: "fact", text: proofText, citation: proofId }, ask], kind: "wrong_place" };
    }
    return { draft: [opener, { kind: "fact", text: "Plants like yours cut cycle time by 23% in the first quarter.", citation: proofId }, ask], kind: "invented_number" };
  }

  aloneFollowsLaw(seed: number, contactKey: string): boolean {
    return u("alone-law", seed, contactKey) < this.p("aloneFollowsLaw");
  }
}
