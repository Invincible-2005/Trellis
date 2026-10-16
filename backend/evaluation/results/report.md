# Agent evaluation

2026-10-16 · agent `google_genai:gemini-flash-lite-latest` · judge `gemini-3.5-flash-lite` (DeepEval 4.3.0) · 10 questions from `plans/documents/test-files`, each asked as a real member of the test org with that person's permissions.

The judge is the agent's own model (Flash-Lite), because the free tier allows only ~20 Gemini Flash requests a day; scores may be slightly generous.

## Scores (0 to 1, higher is better, pass mark 0.5; bold = below it)

| # | Asked as | Question | Context Relevancy | Context Precision | Context Recall | Faithfulness | Answer Relevancy |
|---|---|---|---|---|---|---|---|
| 1 | TEST-HR | How many floating holidays do we get in 2026? | **0.11** | 1.00 | 1.00 | 1.00 | 1.00 |
| 2 | TEST-Employee | Can I fly to a client meeting? | **0.24** | 0.50 | 1.00 | 1.00 | 1.00 |
| 3 | TEST-Manager | I clicked a phishing link. What do I do? | **0.12** | 1.00 | 1.00 | 1.00 | 1.00 |
| 4 | TEST-Employee | Can I share my password with a teammate? | **0.20** | **0.37** | 1.00 | 1.00 | 1.00 |
| 5 | TEST-Employee | How many paid leave days do I get? | **0.22** | **0.33** | 1.00 | 1.00 | 1.00 |
| 6 | TEST-Employee | What time is the Alpha standup? | **0.03** | 1.00 | 1.00 | 1.00 | 1.00 |
| 7 | TEST-Manager | How quickly must I respond to a blocked task? | **0.06** | **0.33** | 1.00 | 1.00 | 1.00 |
| 8 | TEST-Manager | What does someone need to get promoted? | **0.24** | 1.00 | 1.00 | 1.00 | 1.00 |
| 9 | TEST-HR | What is the L3 salary band? | **0.06** | 1.00 | 1.00 | 1.00 | 1.00 |
| 10 | TEST-HR | What's the notice period for a manager? | **0.02** | 1.00 | 1.00 | 1.00 | 1.00 |
| | | **Average** | **0.13** | 0.75 | 1.00 | 1.00 | 1.00 |

## What each score means

- **Context Relevancy**: How much of what search returned is about the question. Search always returns 6 document parts and most questions need only one, so this is low by design.
- **Context Precision**: Whether the parts that hold the answer are ranked at the top of the search results.
- **Context Recall**: Whether the parts search found contain everything in the expected answer.
- **Faithfulness**: Whether every claim in the answer is backed by the parts found (no made-up facts).
- **Answer Relevancy**: Whether the answer sticks to the question asked.

## Below the pass mark (judge's reason)

- **#4 Context Precision (0.37)**: The score is 0.37 because the relevant nodes providing the exact policy on sharing passwords were incorrectly ranked behind several irrelevant nodes. Specifically, the third node (which states 'Your login is personal. Never share your password or let someone else use your account, not even a teammate who is just checking something') and the fifth node (which outlines the outcome for 'Sharing your password or letting someone else use your account') should have been ranked higher than the first, second, fourth, and sixth nodes, which only discuss general password rules, phishing, and confidentiality without addressing teammate sharing.
- **#5 Context Precision (0.33)**: The score is 0.33 because the only relevant node is the third node, which states that 'Paid (annual) leave' is '**18 days**'. The score is not higher because the first node, which discusses unused paid leave and probation periods, and the second node, which talks about fixed and floating holidays, are incorrectly ranked higher than the relevant node despite not stating the total number of paid leave days.
- **#7 Context Precision (0.33)**: The score is 0.33 because the only relevant node is ranked third, while the first and second nodes in the retrieval contexts are irrelevant since 'This document discusses strikes and deadlines, but does not mention how quickly to respond to a blocked task.' and 'This document covers leave, deadlines, and strikes, but does not state the response time for a blocked task.'. The relevant node, which 'directly answers the question by stating, 'When someone marks a task Blocked, reply within 1 working day with help, a new deadline or a reassignment.'', should have been ranked higher than the irrelevant nodes.

## Answers

### 1. How many floating holidays do we get in 2026?

- **Asked as:** Student Test (TEST-HR) · route `read` · 27.3 s
- **Searched for:** "floating holidays 2026" · rewrites: 0
- **Documents in the results:** hr-compensation-and-payroll, org-code-of-conduct, org-holiday-calendar-2026, org-travel-and-expense-policy (should include `org-holiday-calendar-2026.docx`)
- **Expected:** Everyone may take 2 floating holidays in 2026, chosen from Eid al-Fitr, Raksha Bandhan, Onam, Pongal and Dussehra. Ask your manager at least 7 days before.
- **Agent answered:** Everyone gets 2 floating holidays in 2026, which can be chosen from Eid al-Fitr, Raksha Bandhan, Onam, Pongal, and Dussehra.

### 2. Can I fly to a client meeting?

- **Asked as:** Piyush Kumar (TEST-Employee) · route `read` · 34.5 s
- **Searched for:** "fly client meeting travel flight expense" · rewrites: 0
- **Documents in the results:** employee-handbook, org-code-of-conduct, org-travel-and-expense-policy, team-alpha-project-charter (should include `org-travel-and-expense-policy.md`)
- **Expected:** Only in economy class, and only when the train journey is longer than 8 hours. Every trip needs your manager's approval before booking, and trips costing more than Rs 25,000 in total also need the Admin's approval.
- **Agent answered:** Yes, you can fly to a client meeting under the following conditions:

* **Approval:** Every work trip requires your manager's approval before booking. If the total trip cost exceeds **Rs 25,000**, it also needs Admin's approval.
* **Booking:** You should book through the company travel desk when possible.
* **Flight Eligibility:** Flights must be economy class, and you are only permitted to fly when the corresponding train journey is longer than **8 hours**.

### 3. I clicked a phishing link. What do I do?

- **Asked as:** Jayant Kumar Thakur (TEST-Manager) · route `read` · 21.5 s
- **Searched for:** "phishing link" · rewrites: 0
- **Documents in the results:** employee-handbook, org-code-of-conduct, org-it-security-policy (should include `org-it-security-policy.pdf`)
- **Expected:** Report it to IT support within 1 hour of noticing it.
- **Agent answered:** A clicked phishing link is considered a security incident. You should:

* Report the security incident to IT support within **1 hour** of noticing it.

### 4. Can I share my password with a teammate?

- **Asked as:** Piyush Kumar (TEST-Employee) · route `read` · 17.8 s
- **Searched for:** "password sharing" · rewrites: 0
- **Documents in the results:** employee-handbook, org-code-of-conduct, org-it-security-policy (should include `org-code-of-conduct.md`)
- **Expected:** No. Never share your password or let someone else use your account, not even a teammate; it leads to a strike and IT resets the account.
- **Agent answered:** No, you must never share your password or let someone else use your account, not even a teammate who is "just checking something". 

Sharing your password is considered a security incident, and the usual outcome is a strike and an IT account reset.

### 5. How many paid leave days do I get?

- **Asked as:** Piyush Kumar (TEST-Employee) · route `read` · 26.2 s
- **Searched for:** "paid leave days" · rewrites: 0
- **Documents in the results:** employee-handbook, org-code-of-conduct, org-holiday-calendar-2026, team-alpha-project-charter (should include `employee-handbook.md`)
- **Expected:** 18 paid leave days a year.
- **Agent answered:** You get **18 days** of paid (annual) leave per year. 

Additionally, you receive:
- **10 days** of sick leave per year.
- **5 days** of bereavement leave.
- **2 floating holidays** for 2026.

### 6. What time is the Alpha standup?

- **Asked as:** Piyush Kumar (TEST-Employee) · route `read` · 16.9 s
- **Searched for:** "Alpha standup time" · rewrites: 0
- **Documents in the results:** employee-handbook, org-code-of-conduct, org-holiday-calendar-2026, team-alpha-project-charter (should include `team-alpha-project-charter.md`)
- **Expected:** The TEST-Alpha standup is at 10:15, lasts 15 minutes, and is held on Google Meet.
- **Agent answered:** The daily standup for the Alpha team is at **10:15** on Google Meet.

### 7. How quickly must I respond to a blocked task?

- **Asked as:** Jayant Kumar Thakur (TEST-Manager) · route `read` · 20.4 s
- **Searched for:** "blocked task SLA response time policy" · rewrites: 0
- **Documents in the results:** employee-handbook, manager-playbook, org-code-of-conduct (should include `manager-playbook.md`)
- **Expected:** Within 1 working day.
- **Agent answered:** When someone marks a task as blocked, you must reply within **1 working day** with help, a new deadline, or a reassignment.

### 8. What does someone need to get promoted?

- **Asked as:** Jayant Kumar Thakur (TEST-Manager) · route `read` · 21.0 s
- **Searched for:** "promoted promotion requirements" · rewrites: 0
- **Documents in the results:** manager-performance-reviews, manager-playbook, org-code-of-conduct (should include `manager-performance-reviews.pptx`)
- **Expected:** Two reviews in a row rated 4 or higher, and the manager nominates them by 15 February.
- **Agent answered:** To get promoted, someone needs:

* Two performance reviews in a row rated 4 ("Exceeds expectations") or higher.
* A manager nomination by 15 February.
* Approval from Admin (with HR updating the salary band).

### 9. What is the L3 salary band?

- **Asked as:** Student Test (TEST-HR) · route `read` · 20.6 s
- **Searched for:** "L3 salary band" · rewrites: 0
- **Documents in the results:** hr-compensation-and-payroll, hr-recruitment-and-onboarding, org-code-of-conduct, org-travel-and-expense-policy (should include `hr-compensation-and-payroll.txt`)
- **Expected:** Rs 10 to 16 lakh per year (L3 Senior Engineer).
- **Agent answered:** The L3 Senior Engineer salary band is Rs 10 to 16 lakh per year (annual CTC).

### 10. What's the notice period for a manager?

- **Asked as:** Student Test (TEST-HR) · route `read` · 36.9 s
- **Searched for:** "notice period manager" · rewrites: 0
- **Documents in the results:** hr-compensation-and-payroll, hr-recruitment-and-onboarding, org-code-of-conduct (should include `hr-recruitment-and-onboarding.md`)
- **Expected:** 60 days.
- **Agent answered:** The notice period for a manager is **60 days**.
