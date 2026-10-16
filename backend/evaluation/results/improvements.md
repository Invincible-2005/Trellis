# What to improve in the agent

Based on the first evaluation run (16 October 2026, all 10 questions scored). Scores and reasons are in
[`report.md`](report.md); the answers and the document parts each search returned are in
[`answers.json`](answers.json). Nothing below has been built yet: these are the options, with a
recommended order at the end.

## Results in one line each

| Measure | Average | What it tells us |
|---|---|---|
| Context Relevancy | 0.13 | Lots of unrelated text reaches the agent: 6 pieces of ~1,000 characters per question, and most questions need one. |
| Context Precision | 0.75 | Search finds the right document, but inside it the right part often isn't ranked first (#4, #5, #7 had it 3rd; #2 2nd). |
| Context Recall | 1.00 | Every search found everything the expected answer needed. |
| Faithfulness | 1.00 | No made-up facts. |
| Answer Relevancy | 1.00 | Answers stay on the question. |

Also seen, outside the five measures:

- **Speed:** 17–37 seconds per answer. Gemini's free tier was overloaded that day and the agent
  quietly retries "busy" replies, so these times are not reliable yet.
- **AI calls:** every document question costs 4 calls (route, choose a search, grade, answer) plus one
  embedding. The grader approved all 10 searches and no question needed a rewrite.
- **Permissions:** each question was asked as a real Employee, Manager or HR member, and every answer
  came only from documents that person may see.

**Caveats:** the 10 questions are easy (one fact each, all answerable), and the judge is the agent's
own model (Flash-Lite), so treat 1.00 as "no problems found", not "perfect".

## 1. How documents are cut into pieces (biggest effect: Context Precision)

Today: 1,000-character pieces with 200 overlap for most files, 500 / 100 for slides (ticket 11).

| Option | Evidence from our run | Trade-off | Worth it? |
|---|---|---|---|
| **Smaller pieces: 500 characters for every file type** | The slides (500-character pieces) ranked perfectly (#8). Handbook and playbook pieces mix several topics, so the right part came 3rd (#5: the "unused leave and probation" piece beat the "18 days" table; #7: "Blocked tasks" shared a piece with other sections). | One setting, plus re-indexing every document once. An answer spread over two pieces could lose part of it (watch Recall). | **Yes, best value.** |
| **Title and section name at the start of each piece** before it's embedded | #4: the IT security policy's general password rules outranked the code of conduct's "Accounts and passwords" section. | Very small change, plus a re-index. | **Yes.** Pairs with smaller pieces. |
| **Cut at section headings** (each "## Blocked tasks" becomes its own piece) | Same as #7 above. | More code, and different per file type (md, docx, pdf). | Maybe. Smaller pieces gets most of the gain. |

## 2. How search picks pieces (Context Relevancy)

Today: the 6 most similar pieces the user may see.

| Option | Evidence from our run | Trade-off | Worth it? |
|---|---|---|---|
| **Return 4 pieces instead of 6** | #9 (L3 salary) also pulled the travel policy and code of conduct; #10 had 1 useful piece out of 6 (relevancy 0.02). | #2 (flights) needed 2 pieces, so going lower risks half-answers. | Yes, after the smaller pieces. |
| **Similarity cutoff** (drop pieces much less similar than the best one) | Same as above. | A threshold to tune. | Optional, an alternative to fewer pieces. |
| **Re-ranking** (fetch ~10, a second model reorders them) | Would fix precision directly. | Another model, or more LLM calls on the free tier. | No, too heavy for this project. |
| **Keyword + vector search together** | Exact terms ("L3", "Alpha") were found anyway. | Two search systems to maintain. | No. |

## 3. Agent flow: speed and AI calls

| Option | Evidence from our run | Trade-off | Worth it? |
|---|---|---|---|
| **Measure time per step first** (route, search, grade, answer) | 17–37 s, mixed up with Gemini being busy. We can't tell which step is slow. | None. | **Yes, before any speed change.** |
| **Skip the grader when search is clearly good** (best piece very similar to the question) | Grader approved 10/10 and triggered no rewrites: one extra call each time that changed nothing. | Loses the safety net for vague questions (not tested yet). | Yes, after measuring. |
| **Skip the routing call for obvious questions** (simple rules: "what / how / can I …?") | All 10 routed correctly, at one call each. | Rules can misroute; a change sent down the read path just gets no Confirm card. | Maybe. |
| **Fail fast when Gemini is busy** (fewer silent retries, show "assistant is busy") | Many "busy" replies that day. | The user sees a clear message sooner, instead of a slow answer. | Maybe, depending on the timing results. |
| **Paid Gemini tier for demo day** | Free-tier overloads; Flash allows only ~20 free requests a day. | Costs money; switching is one setting. | Piyush's call, for the live demo only. |

## 4. How answers are written (polish only)

| Option | Evidence from our run | Trade-off | Worth it? |
|---|---|---|---|
| **Answer what was asked, then offer more** | #5 (paid leave) also listed sick and bereavement leave. | One prompt line. | Optional. |
| **Always include conditions and deadlines** | #1 left out "ask your manager 7 days before". None of the five measures checks completeness, so nothing flagged it. | One prompt line. | Optional. |

## 5. The evaluation itself

| Option | Why | Worth it? |
|---|---|---|
| **Add 3–5 harder questions**: two documents at once ("Flying to Mumbai: approvals and hotel limit?"), vague wording, follow-ups | All current questions have one fact, so Faithfulness and Answer Relevancy hit the ceiling. | Yes. |
| **Score the "must NOT be answered" questions as pass / fail** (test-files README §4) | Permissions are the core of Trellis, and none of the five measures checks a correct refusal. | Yes, a strong panel slide. |
| **A different judge for the final numbers** (another provider, or one paid Flash run) | The agent's own model grades it today. | Maybe, before the final report. |
| **Rerun after every change, keep a before/after table** | Shows each decision had a measurable effect. | Yes, costs nothing extra. |

## Recommended order

1. Smaller pieces (500) with the document title and section name in each piece, then re-index the 12 test documents.
2. Rerun the evaluation and compare with this run (precision 0.75, relevancy 0.13, recall 1.00).
3. Return 4 pieces instead of 6, rerun.
4. Measure time per step; then skip the grader when search is clearly good.
5. Add harder questions and the "must not answer" pass / fail check.

Everything else above can be skipped for this project.
