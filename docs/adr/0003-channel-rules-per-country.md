# 3. Channel rules per country, strictest by default

Status: accepted

## Context
Germany's UWG §7 requires prior express consent for advertising email, B2B included, and at least presumed consent for
a sales call. Austria's TKG §174 is similar. The US allows cold email with a working opt-out. A sequence tool that sends
the same steps everywhere breaks the law in the engine's main market.

## Decision
`config/seller/channels.json` holds, per country, whether email, phone, LinkedIn and letter need express consent,
presumed consent or an opt-out, and the legal basis text shown to the SDR. A country that is not listed gets the most
restrictive rule. Only documented evidence (an opt-in, an existing customer relationship, an inbound inquiry, a meeting)
counts as consent. Suppression by contact key is final.

## Consequences
German contacts without consent are worked by LinkedIn and letter, which reply less. The ablation that emails everyone
books the same meetings at a lower cost, with 65 violations per 100 contacts. The table is a simplification and is
owned by legal, not engineering.
