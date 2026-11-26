# 4. An enrichment waterfall that buys only what a channel can use

Status: accepted

## Context
Running every account through every provider is the default in tools like Clay. It buys emails for German contacts who
cannot legally be emailed, mobile numbers nobody will call, and duplicates from three providers.

## Decision
For each contact, the engine first decides the allowed channels, then the fields those channels need. It orders
providers per field by price divided by observed hit rate, stops at the first verified hit, and never passes the tier's
budget (`budgetEurPerAccount` in the playbook). Tier C buys nothing.

## Consequences
On dev seeds enrichment drops from €6,349 to €452 per month. Enriching with every provider adds almost two meetings per
100 accounts at seven times the spend. Observed hit rates in `config/platform.json` must be refreshed from real usage.
