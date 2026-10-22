# Splitting comparison (offline)

The 15 test documents cut 4 ways and searched with the agent's real search phrases, each question limited to the documents that person may see. Relevance comes from a marker phrase that only the answer piece contains (no AI judge), so these are stand-ins for the DeepEval measures. Made by `evaluation/compare_splits.py`; nothing in the app changed.

| Way of cutting | Pieces | Avg size | Returned | Answer 1st | Precision | Useful share | Chars sent | Found |
|---|---|---|---|---|---|---|---|---|
| A today (1,000 cuts, 200 overlap) | 82 | 733 | 6 | 11/18 | 0.75 | 0.16 | 4737 | 17/18 |
| A today (1,000 cuts, 200 overlap) | 82 | 733 | 4 | 11/18 | 0.74 | 0.22 | 3272 | 16/18 |
| A today (1,000 cuts, 200 overlap) | 82 | 733 | 3 | 11/18 | 0.72 | 0.28 | 2439 | 15/18 |
| B sections 400-1,000 + titles | 96 | 646 | 6 | 16/18 | 0.91 | 0.18 | 3899 | 18/18 |
| B sections 400-1,000 + titles | 96 | 646 | 4 | 16/18 | 0.90 | 0.25 | 2653 | 17/18 |
| B sections 400-1,000 + titles | 96 | 646 | 3 | 16/18 | 0.90 | 0.33 | 2067 | 17/18 |
| C sections 200-1,000 + titles | 136 | 466 | 6 | 16/18 | 0.89 | 0.17 | 2882 | 17/18 |
| C sections 200-1,000 + titles | 136 | 466 | 4 | 16/18 | 0.89 | 0.25 | 2017 | 17/18 |
| C sections 200-1,000 + titles | 136 | 466 | 3 | 16/18 | 0.91 | 0.31 | 1550 | 17/18 |
| D parent-child (search ~250 children, return B's sections) | 371 | 217 | 6 | 15/18 | 0.90 | 0.18 | 3976 | 18/18 |
| D parent-child (search ~250 children, return B's sections) | 371 | 217 | 4 | 15/18 | 0.90 | 0.26 | 2657 | 18/18 |
| D parent-child (search ~250 children, return B's sections) | 371 | 217 | 3 | 15/18 | 0.88 | 0.33 | 2077 | 17/18 |

- **Answer 1st / Precision**: stand-ins for Context Precision (live: round 1 0.75, Kestrel baseline 0.78).
- **Useful share / Chars sent**: stand-ins for Context Relevancy (live: round 1 0.13, Kestrel 0.19): more useful pieces and less text sent means less noise.
- **Found**: stand-in for Context Recall (live 1.00). Must stay 18/18.
- **Pieces / Avg size** count what is embedded (for E, the children); **Chars sent** counts what the agent receives (for E, the parents).

## Rank of the answer piece per question (6 returned)

| # | Question | A | B | C | D |
|---|---|---|---|---|---|
| 1 | How many paid leave days do I get during my internship? | 1 | 1 | 1 | 1 |
| 2 | How many earned leave days do I get in 2027, and how many can I carry forward? | 2 | 1 | 1 | 1 |
| 3 | Is Good Friday a holiday? | 1 | 1 | 1 | 1 |
| 4 | How many company holidays in 2027 fall on a weekend? | 2 | 1 | 1 | 2 |
| 5 | I clicked a link in a suspicious email and typed my password. What should I do? | 1 | 1 | 1 | 1 |
| 6 | Can I fly to Pune for a client meeting, and what hotel can I book there? | not found | 3 | 3 | 3 |
| 7 | How many days a week do I need to be in the office, and which days? | 2 | 1 | 1 | 1 |
| 8 | How many days a week do I have to come to the office? | 6 | 5 | not found | 4 |
| 9 | How fast must I acknowledge a P1 incident when I'm on call, and what is the on-call allowance? | 2 | 1 | 1 | 1 |
| 10 | What time is the Falcon standup? | 1 | 1 | 1 | 1 |
| 11 | When does the Falcon beta start and how many drivers are in it? | 4 | 1 | 1 | 1 |
| 12 | What does someone need to get promoted? | 1 | 1 | 1 | 1 |
| 13 | How much overtime can I approve for one person? | 1 | 1 | 1 | 1 |
| 14 | What is the notice period for a Staff Engineer? | 1 | 1 | 1 | 1 |
| 15 | What is the salary band for a Senior Software Engineer? | 1 | 1 | 1 | 1 |
| 16 | Which invoices need two signatures? | 1 | 1 | 1 | 1 |
| 17 | How long is chat history kept in Trellis? | 1 | 1 | 1 | 1 |
| 18 | What has to be true before QA can sign off a release? | 1 | 1 | 1 | 1 |

Strategies: A today (1,000 cuts, 200 overlap); B sections 400-1,000 + titles; C sections 200-1,000 + titles; D parent-child (search ~250 children, return B's sections)
