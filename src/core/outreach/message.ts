// A first-touch message is a list of sentences. A "fact" sentence must cite an accepted signal or an
// approved proof point and pass the claim check against it. An "ask" sentence (greeting, question,
// call to action) may state no facts at all: no numbers, no names, no absolute words.

import { checkSentence, type ClaimPolicy } from "./claims.ts";
import { namesIn, numbersIn, tokens } from "../text/text.ts";

export interface DraftSentence {
  kind: "fact" | "ask";
  text: string;
  citation: string | null;
}

export interface CheckedMessage {
  sentences: { text: string; kind: DraftSentence["kind"]; citation: string | null; kept: boolean; reason: string }[];
  body: string;
  sendable: boolean;
  reason: string;
}

export function checkMessage(
  draft: DraftSentence[],
  lookup: (citation: string) => string | undefined,
  policy: ClaimPolicy,
  neutral: string[],
  footer: string | null,
): CheckedMessage {
  const guard = new Set(policy.guardWords);
  const sentences = draft.map((s) => {
    if (s.kind === "ask") {
      const facts = numbersIn(s.text).length > 0 || namesIn(s.text).some((n) => !neutral.includes(n.stem)) || tokens(s.text).some((t) => guard.has(t));
      return { ...s, kept: !facts, reason: facts ? "an ask sentence states a fact without a citation" : "no factual content" };
    }
    const v = checkSentence({ text: s.text, citation: s.citation }, lookup, policy, neutral);
    return { ...s, kept: v.supported, reason: v.reason };
  });
  const kept = sentences.filter((s) => s.kept);
  const facts = kept.filter((s) => s.kind === "fact");
  const personal = facts.some((s) => s.citation?.startsWith("sig:"));
  const sendable = personal && kept.length >= 2;
  const body = kept.map((s) => s.text).join(" ") + (footer ? `\n\n${footer}` : "");
  return {
    sentences,
    body,
    sendable,
    reason: sendable ? "every fact cites a signal or an approved proof point" : personal ? "too little left after the check" : "no sentence about this plant survived the check",
  };
}
