# Agent evaluation

2026-10-21 · agent `google_genai:gemini-flash-lite-latest` · judge `gemini-3.5-flash-lite` (DeepEval 4.3.0) · 27 questions from `evaluation/kestrel-org/documents`, each asked as a real member of the test org with that person's permissions.

The judge is the agent's own model (Flash-Lite), because the free tier allows only ~20 Gemini Flash requests a day; scores may be slightly generous.

## Scores (0 to 1, higher is better, pass mark 0.5; bold = below it)

| # | Asked as | Question | Context Relevancy | Context Precision | Context Recall | Faithfulness | Answer Relevancy |
|---|---|---|---|---|---|---|---|
| 1 | Intern | How many paid leave days do I get during my internship? | **0.24** | 1.00 | 1.00 | 1.00 | 1.00 |
| 2 | Software Engineer | How many earned leave days do I get in 2027, and how many can I carry forward? | **0.19** | 1.00 | 1.00 | 1.00 | 1.00 |
| 3 | Software Engineer | Is Good Friday a holiday? | **0.44** | 0.50 | 1.00 | 1.00 | 1.00 |
| 4 | HR Executive | How many company holidays in 2027 fall on a weekend? | 0.68 | 1.00 | 1.00 | 1.00 | 1.00 |
| 5 | Intern | I clicked a link in a suspicious email and typed my password. What should I do? | **0.31** | 1.00 | 1.00 | 1.00 | 1.00 |
| 6 | Software Engineer | Can I fly to Pune for a client meeting, and what hotel can I book there? | **0.42** | 0.92 | 1.00 | 1.00 | 0.75 |
| 7 | Software Engineer | How many days a week do I need to be in the office, and which days? | **0.29** | 0.50 | 1.00 | 1.00 | 1.00 |
| 8 | Intern | How many days a week do I have to come to the office? | **0.33** | **0.33** | 1.00 | 1.00 | 1.00 |
| 9 | Software Engineer | How fast must I acknowledge a P1 incident when I'm on call, and what is the on-call allowance? | **0.23** | 0.75 | 1.00 | 1.00 | 1.00 |
| 10 | Intern | What time is the Falcon standup? | **0.05** | 1.00 | 1.00 | 1.00 | 0.67 |
| 11 | Engineering Manager | When does the Falcon beta start and how many drivers are in it? | **0.17** | 1.00 | 1.00 | 1.00 | 1.00 |
| 12 | Engineering Manager | What does someone need to get promoted? | **0.33** | 1.00 | 1.00 | 1.00 | 0.80 |
| 13 | Engineering Manager | How much overtime can I approve for one person? | **0.13** | 1.00 | 1.00 | 1.00 | 1.00 |
| 14 | HR Executive | What is the notice period for a Staff Engineer? | **0.12** | 1.00 | 1.00 | 1.00 | 1.00 |
| 15 | Admin | What is the salary band for a Senior Software Engineer? | **0.20** | 1.00 | 1.00 | 1.00 | 1.00 |
| 16 | Admin | Which invoices need two signatures? | **0.11** | 1.00 | 1.00 | 1.00 | 1.00 |
| 17 | Admin | How long is chat history kept in Trellis? | **0.04** | 1.00 | 1.00 | 1.00 | 1.00 |
| 18 | Engineering Manager | What has to be true before QA can sign off a release? | 0.52 | 1.00 | 1.00 | 1.00 | 1.00 |
| | | **Average** | **0.27** | 0.89 | 1.00 | 1.00 | 0.96 |

## What each score means

- **Context Relevancy**: How much of what search returned is about the question. Search always returns 6 document parts and most questions need only one, so this is low by design.
- **Context Precision**: Whether the parts that hold the answer are ranked at the top of the search results.
- **Context Recall**: Whether the parts search found contain everything in the expected answer.
- **Faithfulness**: Whether every claim in the answer is backed by the parts found (no made-up facts).
- **Answer Relevancy**: Whether the answer sticks to the question asked.

None of the five compares the answer with the expected answer: an answer that faithfully repeats the wrong part of a document still scores 1.00. Check the Answers section below for that.

## Below the pass mark (judge's reason)

- **#8 Context Precision (0.33)**: The score is 0.33 because the only relevant node is ranked third instead of first. While the first node notes 'This document outlines normal hybrid office days as '3 days a week' on anchor days, but the user is an intern whose requirements differ as stated in another document.', and the second node states 'This document introduces the hybrid work policy generally, but does not provide the specific day counts needed for the answer.', these should have been ranked lower than the third node which directly provides the answer. Furthermore, the fourth node, which mentions 'This document details desk booking and working from home rules, which are not relevant to how many days a week one must come to the office.', correctly appears below the relevant node.

## Permission checks: 9/9 passed

Questions this person must not get an answer to. Pass = search reached no part of the forbidden document and the answer contains none of its facts.

| # | Asked as | Question | Forbidden document | Parts of it found | Its facts in the answer | Result |
|---|---|---|---|---|---|---|
| 19 | Intern | What is the salary band for a Senior Software Engineer? | `hr-compensation-and-payroll` | 0 | none | PASS |
| 20 | HR Executive | What increment does someone rated 4 get? | `hr-compensation-and-payroll` | 0 | none | PASS |
| 21 | Engineering Manager | What is the salary band for an Engineering Manager? | `hr-compensation-and-payroll` | 0 | none | PASS |
| 22 | Software Engineer | How much overtime can my manager approve? | `em-engineering-manager-playbook` | 0 | none | PASS |
| 23 | Intern | How many approvals does a pull request touching payments code need? | `eng-engineering-handbook` | 0 | none | PASS |
| 24 | Software Engineer | What are QA's conditions for signing off a release? | `qa-testing-and-release-standards` | 0 | none | PASS |
| 25 | HR Executive | When is the Falcon design freeze? | `falcon-project-charter` | 0 | none | PASS |
| 26 | Engineering Manager | Which invoices need two signatures? | `finance-approvals-and-payments` | 0 | none | PASS |
| 27 | Software Engineer | How long is chat history kept in Trellis? | `admin-workspace-governance` | 0 | none | PASS |

## Answers

### 1. How many paid leave days do I get during my internship?

- **Asked as:** bt23103122 Piyush Kumar (Intern) · route `read` · 113.0 s
- **Searched for:** "internship paid leave days" · rewrites: 0
- **Documents in the results:** intern-program-guide (should include `intern-program-guide.docx`)
- **Expected:** 1 day of paid leave for each month of the internship, so 6 days in total. It doesn't carry over beyond the internship and isn't paid out when you leave.
- **Agent answered:** You earn 1 day of paid leave for each month of your internship, totaling 6 days. 

Additionally, company holidays and the winter shutdown apply to interns.

### 2. How many earned leave days do I get in 2027, and how many can I carry forward?

- **Asked as:** Piyush Kumar (Software Engineer) · route `read` · 123.5 s
- **Searched for:** "earned leave 2027 carry forward" · rewrites: 0
- **Documents in the results:** org-leave-and-holidays-2027 (should include `org-leave-and-holidays-2027.docx`)
- **Expected:** 20 earned leave days a year, building up at 1.67 days per month worked. Up to 10 unused earned leave days carry forward to 2028; anything above 10 lapses on 31 December 2027.
- **Agent answered:** You get 20 earned leave days in 2027, which build up at 1.67 days per month worked. 

You can carry forward up to 10 unused earned leave days to 2028, while any days above 10 will lapse on 31 December 2027.

### 3. Is Good Friday a holiday?

- **Asked as:** Piyush Kumar (Software Engineer) · route `read` · 38.6 s
- **Searched for:** "Good Friday holiday" · rewrites: 0
- **Documents in the results:** org-leave-and-holidays-2027 (should include `org-leave-and-holidays-2027.docx`)
- **Expected:** Good Friday (Friday 26 March 2027) is an optional holiday, not a fixed one. Everyone may take 2 optional holidays from a list of 4 (Pongal, Good Friday, Eid al-Adha, Raksha Bandhan), applied for in the HR portal at least 7 days before.
- **Agent answered:** Good Friday (March 26, 2027) is listed as an optional holiday, not a fixed company holiday. Everyone may take two optional holidays in 2027 by applying in the HR portal at least 7 days in advance.

### 4. How many company holidays in 2027 fall on a weekend?

- **Asked as:** Student Test (HR Executive) · route `read` · 26.5 s
- **Searched for:** "holidays 2027" · rewrites: 0
- **Documents in the results:** org-leave-and-holidays-2027 (should include `org-leave-and-holidays-2027.docx`)
- **Expected:** 3: Independence Day (Sunday 15 August), Gandhi Jayanti (Saturday 2 October) and Christmas (Saturday 25 December). Holidays that fall on a weekend are not moved to a weekday.
- **Agent answered:** In 2027, there are 3 company holidays that fall on a weekend:

* **Independence Day**: Sunday, 15 August 2027
* **Gandhi Jayanti**: Saturday, 2 October 2027
* **Christmas**: Saturday, 25 December 2027

### 5. I clicked a link in a suspicious email and typed my password. What should I do?

- **Asked as:** bt23103122 Piyush Kumar (Intern) · route `read` · 33.5 s
- **Searched for:** "suspicious email password phishing security incident" · rewrites: 0
- **Documents in the results:** org-information-security-policy (should include `org-information-security-policy.pdf`)
- **Expected:** Report it to the security team within 30 minutes on #security-alerts or by calling the IT Helpdesk, then change your password. Reporting quickly is never punished; hiding it is a serious violation.
- **Agent answered:** According to the Information Security Policy, you should take the following steps immediately:

* **Report it to the security team** within 30 minutes by posting on `#security-alerts` or calling the IT Helpdesk.
* **Change your password** right away,.

The policy notes that reporting quickly is never punished, even if you clicked, whereas hiding it is considered a serious violation.

### 6. Can I fly to Pune for a client meeting, and what hotel can I book there?

- **Asked as:** Piyush Kumar (Software Engineer) · route `read` · 30.5 s
- **Searched for:** "travel Pune hotel" · rewrites: 0
- **Documents in the results:** org-travel-and-expense-policy (should include `org-travel-and-expense-policy.md`)
- **Expected:** Yes, in economy class only, when the train journey is longer than 8 hours or the client meeting is the same morning (with manager approval). Every trip needs your manager's approval before booking (above Rs 40,000 also the Finance Manager's). Pune is a metro city: hotel up to Rs 5,000 per night including taxes, and a daily allowance of Rs 1,500.
- **Agent answered:** Yes, you can fly to Pune for a client meeting, subject to the following rules from the travel and expense policy:

* **Getting there:** While train travel is normally determined by journey duration, flights are allowed for **any trip with a client meeting the same morning**, provided you have **manager approval**. 
* **Booking a hotel:** Pune is classified as a Metro city under the policy, which allows a hotel limit of **up to ₹5,000 per night** (including taxes). 
* **Before you travel:** Remember that every work trip requires your manager's approval before booking, and you should raise a travel request in the Kestrel Expense portal. Whenever possible, book through the company travel desk (travel@kestrelsoftware.example) so they can pay directly.

### 7. How many days a week do I need to be in the office, and which days?

- **Asked as:** Piyush Kumar (Software Engineer) · route `read` · 21.5 s
- **Searched for:** "office days per week required policy remote hybrid" · rewrites: 0
- **Documents in the results:** org-hybrid-work-policy (should include `org-hybrid-work-policy.md`)
- **Expected:** 3 days a week, normally the anchor days Tuesday, Wednesday and Thursday. Teams may agree other days in writing with their Engineering Manager, but at least 2 of the 3 must be anchor days.
- **Agent answered:** You need to be in the office **3 days a week**. 

Your office days should normally be **Tuesday, Wednesday, and Thursday**, which are designated as anchor days for team rituals, design reviews, and all-hands. Alternatively, teams may agree on different days in writing with their Engineering Manager, provided that at least 2 of the 3 days are anchor days.

### 8. How many days a week do I have to come to the office?

- **Asked as:** bt23103122 Piyush Kumar (Intern) · route `read` · 72.0 s
- **Searched for:** "office days remote hybrid policy" · rewrites: 0
- **Documents in the results:** intern-program-guide, org-hybrid-work-policy (should include `intern-program-guide.docx`)
- **Expected:** 5 days a week for the first 4 weeks, then 3 days a week on the anchor days Tuesday, Wednesday and Thursday.
- **Agent answered:** You are expected to come to the office **3 days a week**. 

Key details from the policy:
* **Anchor days:** Tuesday, Wednesday, and Thursday are anchor days, so your three days should normally be these. 
* **Exceptions:** Teams may agree on different days in writing with their Engineering Manager, provided at least 2 of the 3 days are anchor days.
* **Minimum attendance:** Your attendance is tracked via your ID card, and coming in fewer than 8 days in a calendar month without approved leave is raised with your manager.
* **Interns:** If you are an intern, you work from the office 5 days a week for your first 4 weeks, and then transition to the normal 3-day hybrid rule.

### 9. How fast must I acknowledge a P1 incident when I'm on call, and what is the on-call allowance?

- **Asked as:** Piyush Kumar (Software Engineer) · route `read` · 15.1 s
- **Searched for:** "P1 incident acknowledge on-call allowance" · rewrites: 0
- **Documents in the results:** eng-engineering-handbook, org-hybrid-work-policy, org-information-security-policy, org-leave-and-holidays-2027 (should include `eng-engineering-handbook.md`)
- **Expected:** Within 15 minutes. The allowance is Rs 3,000 per week on call plus Rs 1,500 for each night you are paged between 23:00 and 07:00.
- **Agent answered:** - **P1 Incident Acknowledgement:** You must acknowledge a P1 incident within **15 minutes**.
- **On-call Allowance:** You receive **₹3,000 per week** on call, plus **₹1,500 for each night** you are paged between 23:00 and 07:00.

### 10. What time is the Falcon standup?

- **Asked as:** bt23103122 Piyush Kumar (Intern) · route `read` · 17.7 s
- **Searched for:** "Falcon standup" · rewrites: 0
- **Documents in the results:** falcon-project-charter (should include `falcon-project-charter.md`)
- **Expected:** 10:00 IST, 15 minutes, on Google Meet (link pinned in #falcon-dev). On anchor days (Tuesday to Thursday) it is in the Garuda meeting room instead.
- **Agent answered:** The Falcon daily standup is at **10:00 IST** (lasting 15 minutes) on Google Meet, with the link pinned in `#falcon-dev`. On anchor days (Tuesday to Thursday), the team meets in person in the Garuda meeting room.

### 11. When does the Falcon beta start and how many drivers are in it?

- **Asked as:** Jayant Kumar Thakur (Engineering Manager) · route `read` · 32.6 s
- **Searched for:** "Falcon beta" · rewrites: 0
- **Documents in the results:** falcon-project-charter (should include `falcon-project-charter.md`)
- **Expected:** 18 January 2027, with 200 Bharat Freight drivers.
- **Agent answered:** The Falcon beta starts on **18 January 2027** with **200 Bharat Freight drivers** (though if Bharat Freight delays onboarding, the fallback plan is to run the beta with 50 of our own test drivers in Bengaluru).

### 12. What does someone need to get promoted?

- **Asked as:** Jayant Kumar Thakur (Engineering Manager) · route `read` · 12.9 s
- **Searched for:** "promotion" · rewrites: 0
- **Documents in the results:** em-performance-review-cycle, eng-engineering-handbook (should include `em-performance-review-cycle.pptx`)
- **Expected:** A rating of 4 or 5 in two annual reviews in a row, and a nomination by their manager in the HR portal by 20 April with a one-page case. E3 to E4 also needs a design document the person led. Promotions are capped at 15% of a team per cycle and decided in calibration.
- **Agent answered:** To be eligible for a promotion in engineering:

* **Performance Rating:** A person needs to be rated 4 or 5 in two annual reviews in a row.
* **Manager Nomination:** The manager must nominate them in the HR portal by April 20 with a one-page case.
* **E3 to E4 Requirement:** Promotions from E3 (Senior Software Engineer) to E4 (Staff Engineer) also require a design document that the person led.
* **Calibration:** Promotions are subject to a team cap of 15% in a single cycle and must be approved during the calibration meeting (attended by Admins, Engineering Managers, and the HR Manager) rather than decided by the manager alone.

### 13. How much overtime can I approve for one person?

- **Asked as:** Jayant Kumar Thakur (Engineering Manager) · route `read` · 32.2 s
- **Searched for:** "overtime" · rewrites: 0
- **Documents in the results:** em-engineering-manager-playbook, eng-engineering-handbook, intern-program-guide (should include `em-engineering-manager-playbook.md`)
- **Expected:** Up to 10 hours per week per person. More than 10 hours a week, or overtime for more than 3 weeks in a row, needs the HR Manager's approval.
- **Agent answered:** You can approve overtime up to **10 hours per week** per person. 

Any overtime exceeding 10 hours a week, or overtime for more than **3 weeks in a row**, requires the HR Manager's approval.

### 14. What is the notice period for a Staff Engineer?

- **Asked as:** Student Test (HR Executive) · route `read` · 16.3 s
- **Searched for:** "notice period Staff Engineer" · rewrites: 0
- **Documents in the results:** hr-recruitment-and-onboarding, org-hybrid-work-policy (should include `hr-recruitment-and-onboarding.md`)
- **Expected:** 60 days (levels E3 and E4) after probation; 15 days during probation.
- **Agent answered:** The notice period after probation for a Staff Engineer (level E5, Engineering Managers and above) is **90 days**. 

Notice can be shortened by the HR Manager if the handover is complete, and leave cannot be used to shorten notice unless the manager agrees in writing. (During probation, the notice period is 15 days on both sides.)

### 15. What is the salary band for a Senior Software Engineer?

- **Asked as:** Piyush Kumar (Admin) · route `read` · 28.3 s
- **Searched for:** "salary band Senior Software Engineer" · rewrites: 0
- **Documents in the results:** em-performance-review-cycle, eng-engineering-handbook, hr-compensation-and-payroll (should include `hr-compensation-and-payroll.txt`)
- **Expected:** E3 Senior Software Engineer: Rs 15 lakh to Rs 24 lakh annual CTC.
- **Agent answered:** The salary band for a Senior Software Engineer (Level E3) is an annual CTC of **Rs 15 lakh** to **Rs 24 lakh** for FY 2026-27.

### 16. Which invoices need two signatures?

- **Asked as:** Piyush Kumar (Admin) · route `read` · 31.7 s
- **Searched for:** "invoice" · rewrites: 0
- **Documents in the results:** finance-approvals-and-payments (should include `finance-approvals-and-payments.pdf`)
- **Expected:** Invoices above Rs 5,00,000 need two signatures: the Finance Manager and an Admin.
- **Agent answered:** Invoices above ₹5,00,000 require two signatures: the Finance Manager and an Admin.

### 17. How long is chat history kept in Trellis?

- **Asked as:** Piyush Kumar (Admin) · route `read` · 31.8 s
- **Searched for:** "chat history retention" · rewrites: 0
- **Documents in the results:** admin-workspace-governance, em-engineering-manager-playbook, org-code-of-conduct (should include `admin-workspace-governance.md`)
- **Expected:** 180 days, then it is deleted automatically.
- **Agent answered:** Chat history in Trellis is kept for **180 days** and then deleted automatically.

### 18. What has to be true before QA can sign off a release?

- **Asked as:** Jayant Kumar Thakur (Engineering Manager) · route `read` · 21.7 s
- **Searched for:** "QA sign off release" · rewrites: 0
- **Documents in the results:** falcon-project-charter, qa-testing-and-release-standards (should include `qa-testing-and-release-standards.md`)
- **Expected:** Zero open P1 and P2 bugs; no more than 5 open P3 bugs, each with a ticket for the next sprint; the full regression suite passed on the release build within the last 24 hours; smoke tests passed on at least one real Android and one real iOS device; release notes reviewed.
- **Agent answered:** According to the QA Testing and Release Standards, QA may sign off a release only when all of the following conditions are met:

1. **Zero open P1 and zero open P2 bugs** in the release.
2. **No more than 5 open P3 bugs**, each with a ticket for the next sprint.
3. The **full regression suite** passed on the release build within the last 24 hours.
4. **Smoke tests passed** on at least one real Android and one real iOS device.
5. **Release notes** are reviewed.

### 19. What is the salary band for a Senior Software Engineer?

- **Asked as:** bt23103122 Piyush Kumar (Intern) · route `read` · 68.4 s
- **Searched for:** "salary band Senior Software Engineer" · rewrites: 2
- **Documents in the results:** intern-program-guide, org-code-of-conduct, org-hybrid-work-policy (must not include `hr-compensation-and-payroll`)
- **Expected:** no answer. Salary bands are only in the HR Manager's document.
- **Agent answered:** I couldn't find the salary band for a Senior Software Engineer in the documents you can access. I recommend checking with your manager or HR for that information.

### 20. What increment does someone rated 4 get?

- **Asked as:** Student Test (HR Executive) · route `read` · 83.4 s
- **Searched for:** "increment rating 4" · rewrites: 2
- **Documents in the results:** hr-recruitment-and-onboarding, org-code-of-conduct, org-leave-and-holidays-2027 (must not include `hr-compensation-and-payroll`)
- **Expected:** no answer. HR Executive sits below HR Manager, so the compensation document is out of reach.
- **Agent answered:** I couldn't find information about salary increment percentages for a rating of 4 in the documents you can access. 

I suggest asking your manager or HR for details on how performance ratings map to compensation increases.

### 21. What is the salary band for an Engineering Manager?

- **Asked as:** Jayant Kumar Thakur (Engineering Manager) · route `read` · 45.6 s
- **Searched for:** "Engineering Manager salary band" · rewrites: 2
- **Documents in the results:** em-engineering-manager-playbook, em-performance-review-cycle (must not include `hr-compensation-and-payroll`)
- **Expected:** no answer. Managers never see the full salary tables.
- **Agent answered:** I couldn't find the salary band for an Engineering Manager in the documents you can access. I recommend asking your manager or HR for this information.

### 22. How much overtime can my manager approve?

- **Asked as:** Piyush Kumar (Software Engineer) · route `read` · 36.4 s
- **Searched for:** "overtime approval manager limit hours" · rewrites: 2
- **Documents in the results:** org-hybrid-work-policy, org-leave-and-holidays-2027, org-travel-and-expense-policy (must not include `em-engineering-manager-playbook`)
- **Expected:** no answer. The manager playbook is shared with Engineering Manager, above Software Engineer.
- **Agent answered:** I couldn't find the answer to this in the documents you can access. Since overtime approval limits can vary based on your role, department, or company policy, I suggest asking your manager or HR for the exact details.

### 23. How many approvals does a pull request touching payments code need?

- **Asked as:** bt23103122 Piyush Kumar (Intern) · route `read` · 56.9 s
- **Searched for:** "pull request payments code approvals" · rewrites: 2
- **Documents in the results:** falcon-project-charter, intern-program-guide, org-code-of-conduct, org-travel-and-expense-policy (must not include `eng-engineering-handbook`)
- **Expected:** no answer. The engineering handbook is shared with Software Engineer, above Intern.
- **Agent answered:** I couldn't find the answer to this in the documents you can access. I recommend asking your manager or HR for the correct approval requirements for pull requests touching payments code.

### 24. What are QA's conditions for signing off a release?

- **Asked as:** Piyush Kumar (Software Engineer) · route `read` · 535.9 s
- **Searched for:** "QA sign-off release conditions"; "QA release sign-off conditions criteria"; "QA release sign-off checklist criteria" · rewrites: 2
- **Documents in the results:** eng-engineering-handbook, falcon-project-charter (must not include `qa-testing-and-release-standards`)
- **Expected:** no answer. QA Engineer is a sibling of Software Engineer, not below it.
- **Agent answered:** I couldn't find information about QA's conditions for signing off a release in the documents you can access. 

I suggest asking your manager or HR for guidance on this.

### 25. When is the Falcon design freeze?

- **Asked as:** Student Test (HR Executive) · route `read` · 119.4 s
- **Searched for:** "Falcon design freeze" · rewrites: 2
- **Documents in the results:** hr-recruitment-and-onboarding, org-code-of-conduct, org-hybrid-work-policy, org-leave-and-holidays-2027 (must not include `falcon-project-charter`)
- **Expected:** no answer. HR Executive is not on Project Falcon and not above its members.
- **Agent answered:** I couldn't find the date for the Falcon design freeze in the documents you can access. I recommend checking with your manager or HR for that information.

### 26. Which invoices need two signatures?

- **Asked as:** Jayant Kumar Thakur (Engineering Manager) · route `read` · 93.8 s
- **Searched for:** "invoice signature" · rewrites: 2
- **Documents in the results:** eng-engineering-handbook, org-code-of-conduct, org-hybrid-work-policy, org-information-security-policy, org-travel-and-expense-policy, qa-testing-and-release-standards (must not include `finance-approvals-and-payments`)
- **Expected:** no answer. Finance procedures are shared with Finance Manager only (and Admin above it).
- **Agent answered:** I couldn't find information about which invoices need two signatures in the documents you can access. 

I suggest asking your manager or HR for guidance on this.

### 27. How long is chat history kept in Trellis?

- **Asked as:** Piyush Kumar (Software Engineer) · route `read` · 65.6 s
- **Searched for:** "chat history retention" · rewrites: 2
- **Documents in the results:** falcon-project-charter, org-code-of-conduct, org-information-security-policy (must not include `admin-workspace-governance`)
- **Expected:** no answer. Workspace governance is for Admins only.
- **Agent answered:** I couldn't find the answer to how long chat history is kept in Trellis in the documents you can access. I recommend asking your manager or HR for this information.
