// A deterministic drafter for offline runs and tests: it quotes the strongest signal and adds one
// matching proof point. Claude drafts the same structure in the live service.

import type { AcceptedSignal } from "../types.ts";
import type { DraftSentence } from "./message.ts";

/** A signal is cited by document and type: one document can carry several signals. */
export function signalCitation(s: Pick<AcceptedSignal, "docId" | "type">): string {
  return `sig:${s.docId}:${s.type}`;
}

const PROOF_FOR: Record<string, string> = {
  ie_hiring: "pp-ie",
  lean_hiring: "pp-cycle",
  assembler_hiring: "pp-cycle",
  new_line: "pp-ramp",
  plant_expansion: "pp-ramp",
  reshoring_us: "pp-setup",
};

export function templateDraft(signal: AcceptedSignal, proofText: (id: string) => string | undefined): DraftSentence[] {
  const pp = PROOF_FOR[signal.type] ?? "pp-cycle";
  const proof = proofText(pp);
  const lead = signal.type.endsWith("_hiring") ? "Saw your posting" : "Read the announcement";
  const out: DraftSentence[] = [{ kind: "fact", text: `${lead}: "${signal.quote.replace(/[.\s]+$/, "")}".`, citation: signalCitation(signal) }];
  if (proof) out.push({ kind: "fact", text: proof, citation: pp });
  out.push({ kind: "ask", text: "Would a short call with your team next week be useful?", citation: null });
  return out;
}
