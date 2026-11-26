# 1. The model reads, code decides

Status: accepted

## Context
Outbound tooling increasingly lets a language model choose who to contact, on which channel, and what to say. Each of
those choices has a cost that the model does not see: a wrong signal becomes a false claim in a prospect's inbox, a
wrong channel in Germany is an unfair-competition violation, a wrong enrichment call is money.

## Decision
Claude reads documents and returns typed candidates with a verbatim quote, and drafts message sentences that cite their
source. Code validates every candidate, scores plants, picks channels, runs the enrichment waterfall, checks every
sentence and plans the CRM writes. The prompt fences documents as data.

## Consequences
The lab's "model alone" design measures the alternative: 238.8 false claims per 1,000 messages and 40 outreach-law
violations per 100 contacts on dev seeds, against zero for both here. The price is code to maintain for each decision,
and a model that cannot improve a decision it does not own.
