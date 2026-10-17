# Splitting comparison (offline)

The 12 test documents cut five ways and searched with the agent's real search phrases, each question limited to the documents that person may see. Relevance comes from a marker phrase that only the answer piece contains (no AI judge), so these are stand-ins for the DeepEval measures. Made by `evaluation/compare_splits.py`; nothing in the app changed.

| Way of cutting | Pieces | Avg size | Returned | Answer 1st | Precision | Useful share | Chars sent | Found |
|---|---|---|---|---|---|---|---|---|
| A today (1,000 cuts) | 28 | 680 | 6 | 6/10 | 0.75 | 0.18 | 4157 | 10/10 |
| A today (1,000 cuts) | 28 | 680 | 4 | 6/10 | 0.75 | 0.25 | 2683 | 10/10 |
| A today (1,000 cuts) | 28 | 680 | 3 | 6/10 | 0.75 | 0.33 | 2116 | 10/10 |
| B by heading | 79 | 212 | 6 | 9/10 | 0.91 | 0.18 | 1309 | 10/10 |
| B by heading | 79 | 212 | 4 | 9/10 | 0.91 | 0.28 | 866 | 10/10 |
| B by heading | 79 | 212 | 3 | 9/10 | 0.93 | 0.33 | 684 | 10/10 |
| C by heading + titles | 79 | 261 | 6 | 9/10 | 0.90 | 0.20 | 1597 | 10/10 |
| C by heading + titles | 79 | 261 | 4 | 9/10 | 0.93 | 0.28 | 1094 | 10/10 |
| C by heading + titles | 79 | 261 | 3 | 9/10 | 0.93 | 0.37 | 863 | 10/10 |
| D by heading + titles + merging | 35 | 557 | 6 | 8/10 | 0.88 | 0.18 | 3497 | 10/10 |
| D by heading + titles + merging | 35 | 557 | 4 | 8/10 | 0.88 | 0.28 | 2411 | 10/10 |
| D by heading + titles + merging | 35 | 557 | 3 | 8/10 | 0.90 | 0.33 | 1795 | 10/10 |
| E parent-child (search C, return section blocks) | 79 | 261 | 6 | 10/10 | 0.97 | 0.18 | 4844 | 10/10 |
| E parent-child (search C, return section blocks) | 79 | 261 | 4 | 10/10 | 0.97 | 0.28 | 3308 | 10/10 |
| E parent-child (search C, return section blocks) | 79 | 261 | 3 | 10/10 | 1.00 | 0.33 | 2482 | 10/10 |

- **Answer 1st / Precision**: stand-ins for Context Precision (the live run scored 0.75).
- **Useful share / Chars sent**: stand-ins for Context Relevancy (live 0.13): more useful pieces and less text sent means less noise.
- **Found**: stand-in for Context Recall (live 1.00). Must stay 10/10.
- **Pieces / Avg size** count what is embedded (for E, the children); **Chars sent** counts what the agent receives (for E, the parents).

## Rank of the answer piece per question (6 returned)

| # | Question | A | B | C | D | E |
|---|---|---|---|---|---|---|
| 1 | How many floating holidays do we get in 2026? | 1 | 1 | 1 | 1 | 1 |
| 2 | Can I fly to a client meeting? | 2 | 1 | 1 | 2 | 1 |
| 3 | I clicked a phishing link. What do I do? | 1 | 3 | 2 | 1 | 1 |
| 4 | Can I share my password with a teammate? | 3 | 1 | 1 | 1 | 1 |
| 5 | How many paid leave days do I get? | 3 | 1 | 1 | 1 | 1 |
| 6 | What time is the Alpha standup? | 1 | 1 | 1 | 1 | 1 |
| 7 | How quickly must I respond to a blocked task? | 3 | 1 | 1 | 2 | 1 |
| 8 | What does someone need to get promoted? | 1 | 1 | 1 | 1 | 1 |
| 9 | What is the L3 salary band? | 1 | 1 | 1 | 1 | 1 |
| 10 | What's the notice period for a manager? | 1 | 1 | 1 | 1 | 1 |

Strategies: A today (1,000 cuts); B by heading; C by heading + titles; D by heading + titles + merging; E parent-child (search C, return section blocks)
