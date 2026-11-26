# 6. A lab with hidden truth and held-out seeds

Status: accepted

## Context
Outbound results are slow and noisy: a quarter of real sends cannot separate a better design from a better list. And
no real dataset says which plants truly needed line analytics.

## Decision
The lab simulates a market where that truth is known: need, timing, closures, consent and provider coverage. Designs
never see it; the scorer does. Every design works the same accounts on the same luck. Gates were frozen before the
held-out seeds ran once, behind a lock that records the config hash.

## Consequences
The numbers compare designs under stated assumptions; they are not a forecast. Anything the world does not model (reply
quality, seasonality, brand) is outside what the lab can say.
