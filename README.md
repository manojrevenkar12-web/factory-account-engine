# factory-account-engine

<!-- results:start -->
Dev seeds 201, 202, 203: a market of 900 manufacturing companies and their plants per seed. Every design works the same number of accounts per month, on the same market and the same luck.

| | | |
|---|---|---|
| **3.3×**<br>Qualified meetings vs today<br><sub>3.1 → 10.1 per 100 accounts worked</sub> | **€852 → €243**<br>Cost per qualified meeting<br><sub>enrich-everything: €820</sub> | **€6,349 → €452**<br>Enrichment spend per month<br><sub>no email bought for a country where it cannot be used</sub> |
| **0**<br>Outreach-law violations<br><sub>today: 72 per 100 contacts, mostly cold email to Germany</sub> | **90%**<br>Signals that are true<br><sub>without validation: 79%; false claims 68.2 → 0 per 1k messages</sub> | **13% → 59%**<br>In-market plants among those worked<br><sub>plants with a real need and timing this quarter</sub> |

### Designs

| Design | In-market plants worked | Qualified meetings / 100 accounts | Pipeline / month | Cost per qualified meeting | Enrichment / month | Outreach-law violations / 100 contacts | False claims / 1k messages | Duplicate CRM records / month |
|---|--:|--:|--:|--:|--:|--:|--:|--:|
| Firmographic list, HQ contacts, generic sequence (today) | 13% | 3.1 | €80k | €852 | €1,408 | 72 | 0 | 76.3 |
| Enrich every plant with every provider, AI first lines | 24% | 5.6 | €269k | €820 | €6,349 | 76.3 | 129 | 8 |
| LLM reads, ranks, writes and picks channels | 43% | 2.5 | €139k | €420 | €704 | 40.3 | 238.8 | 63.3 |
| Model reads, code decides | 59% | 10.1 | €504k | €243 | €452 | 0 | 0 | 3 |

<details><summary>Ablations: the platform with one safeguard removed</summary>

| Design | In-market plants worked | Qualified meetings / 100 accounts | Pipeline / month | Cost per qualified meeting | Enrichment / month | Outreach-law violations / 100 contacts | False claims / 1k messages | Duplicate CRM records / month |
|---|--:|--:|--:|--:|--:|--:|--:|--:|
| Model reads, code decides | 59% | 10.1 | €504k | €243 | €452 | 0 | 0 | 3 |
| Platform working companies, not plants | 55% | 8.9 | €208k | €282 | €396 | 0 | 0 | 3.7 |
| Platform without signal validation | 60% | 10.2 | €502k | €244 | €497 | 0 | 68.2 | 3 |
| Platform emailing every country | 59% | 10.1 | €511k | €144 | €871 | 65 | 0 | 3 |
| Platform without the claim check | 59% | 9.3 | €458k | €265 | €452 | 0 | 100.6 | 3 |
| Platform enriching with every provider | 59% | 11.9 | €594k | €285 | €3,174 | 0 | 0 | 3 |

</details>

### Gates

| Gate | Dev seeds | Held-out seeds |
|---|---|---|
| Qualified meetings at least 2.5x today's process | pass (10.1 >= 7.75) | not run |
| Pipeline at least 3x today's process | pass (504,000 >= 240,000) | not run |
| Cost per qualified meeting at most half of enrich-everything | pass (243 <= 410) | not run |
| Enrichment spend at most 15% of enrich-everything | pass (452 <= 952.35) | not run |
| No first touch that breaks the country's outreach rules | pass (0 == 0) | not run |
| At most 5 false claims per 1,000 messages | pass (0 <= 5) | not run |
| At least 85% of accepted signals are true | pass (0.902 >= 0.85) | not run |
| Validation adds at least 5 points of signal precision | pass (0.902 >= 0.841) | not run |
| Duplicate CRM records at most a tenth of today's | pass (3 <= 7.63) | not run |
| Plant-level beats company-level on pipeline by at least 50% | pass (504,000 >= 312,000) | not run |
<!-- results:end -->
