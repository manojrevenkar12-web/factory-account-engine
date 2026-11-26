# 5. HubSpot writes keyed by our own property, not by domain

Status: accepted

## Context
HubSpot's batch upsert needs a unique property, and the company domain is not unique: a group and its plants share it,
and many existing records have none. Upserting by name creates duplicates of records an SDR created by hand.

## Decision
Every account gets `fae_account_key` (the company domain, plus `#city` for a plant), a unique HubSpot property. Before
any upsert, existing records are matched by domain, then exact name, then known alias, and get the key with a PATCH.
Then companies and contacts are upserted in batches of 100 by that key, and plants are linked to their group with the
parent-child association.

## Consequences
Duplicate records fall from 76 per month to 3 on dev seeds. The remaining duplicates are records whose name matches no
alias. The property has to be created once per portal.
