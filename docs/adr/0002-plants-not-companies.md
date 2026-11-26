# 2. Work plants, not companies

Status: accepted

## Context
Line analytics is bought for one plant, by its plant manager or head of industrial engineering, when that plant has a
reason: a new line, a ramp, time-study engineers being hired. Firmographic lists and most enrichment tools are keyed by
company domain and route outreach to HQ.

## Decision
The account unit is the plant, keyed `company-domain#city`. Signals are tied to a plant only when the document names its
city; otherwise they stay at company level and count at a 35% share for each of the company's plants. Plants sync to
HubSpot as child companies of their group.

## Consequences
On dev seeds, working at company level with the same budget gives €208k pipeline per month against €504k. Plants need a
city in the account database, and a company whose plants are unknown can only be worked at HQ.
