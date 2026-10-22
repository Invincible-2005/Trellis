# Agent evaluation

2026-10-21 · agent `google_genai:gemini-flash-lite-latest` · judge `gemini-3.5-flash-lite` (DeepEval 4.3.0) · 27 questions from `evaluation/kestrel-org/documents`, each asked as a real member of the test org with that person's permissions.

The judge is the agent's own model (Flash-Lite), because the free tier allows only ~20 Gemini Flash requests a day; scores may be slightly generous.

## Scores (0 to 1, higher is better, pass mark 0.5; bold = below it)

| # | Asked as | Question | Context Relevancy | Context Precision | Context Recall | Faithfulness | Answer Relevancy |
|---|---|---|---|---|---|---|---|
| 1 | Intern | How many paid leave days do I get during my internship? | **0.25** | 1.00 | 1.00 | 1.00 | 1.00 |
| 2 | Software Engineer | How many earned leave days do I get in 2027, and how many can I carry forward? | **0.26** | 0.83 | 1.00 | 1.00 | 1.00 |
| 3 | Software Engineer | Is Good Friday a holiday? | **0.12** | 0.92 | 1.00 | 1.00 | 1.00 |
| 4 | HR Executive | How many company holidays in 2027 fall on a weekend? | **0.40** | 0.92 | 1.00 | 1.00 | 1.00 |
| 5 | Intern | I clicked a link in a suspicious email and typed my password. What should I do? | **0.17** | 1.00 | 1.00 | 1.00 | 1.00 |
| 6 | Software Engineer | Can I fly to Pune for a client meeting, and what hotel can I book there? | **0.16** | **0.18** | 1.00 | 1.00 | 1.00 |
| 7 | Software Engineer | How many days a week do I need to be in the office, and which days? | **0.28** | 0.50 | 1.00 | 1.00 | 1.00 |
| 8 | Intern | How many days a week do I have to come to the office? | **0.45** | **0.17** | 1.00 | 1.00 | 0.88 |
| 9 | Software Engineer | How fast must I acknowledge a P1 incident when I'm on call, and what is the on-call allowance? | **0.12** | 1.00 | 1.00 | 1.00 | 1.00 |
| 10 | Intern | What time is the Falcon standup? | **0.03** | 1.00 | 1.00 | 1.00 | 1.00 |
| 11 | Engineering Manager | When does the Falcon beta start and how many drivers are in it? | **0.10** | **0.25** | 1.00 | 1.00 | 1.00 |
| 12 | Engineering Manager | What does someone need to get promoted? | **0.40** | 1.00 | 1.00 | 1.00 | 1.00 |
| 13 | Engineering Manager | How much overtime can I approve for one person? | **0.19** | 1.00 | 1.00 | 1.00 | 1.00 |
| 14 | HR Executive | What is the notice period for a Staff Engineer? | **0.03** | 1.00 | 1.00 | 1.00 | 1.00 |
| 15 | Admin | What is the salary band for a Senior Software Engineer? | **0.07** | 0.70 | 1.00 | 1.00 | 1.00 |
| 16 | Admin | Which invoices need two signatures? | **0.09** | 1.00 | 1.00 | 1.00 | 1.00 |
| 17 | Admin | How long is chat history kept in Trellis? | **0.04** | 1.00 | 1.00 | 1.00 | 1.00 |
| 18 | Engineering Manager | What has to be true before QA can sign off a release? | **0.27** | 1.00 | 1.00 | 1.00 | 1.00 |
| | | **Average** | **0.19** | 0.80 | 1.00 | 1.00 | 0.99 |

## What each score means

- **Context Relevancy**: How much of what search returned is about the question. Search always returns 6 document parts and most questions need only one, so this is low by design.
- **Context Precision**: Whether the parts that hold the answer are ranked at the top of the search results.
- **Context Recall**: Whether the parts search found contain everything in the expected answer.
- **Faithfulness**: Whether every claim in the answer is backed by the parts found (no made-up facts).
- **Answer Relevancy**: Whether the answer sticks to the question asked.

None of the five compares the answer with the expected answer: an answer that faithfully repeats the wrong part of a document still scores 1.00. Check the Answers section below for that.

## Below the pass mark (judge's reason)

- **#6 Context Precision (0.18)**: The score is 0.18 because the only relevant nodes (the seventh and ninth nodes explaining that 'It specifies that for a train journey longer than 8 hours or a client meeting the same morning, you can book a flight in 'economy class only', and lists Pune under metro cities with a hotel limit of '₹5,000' and daily allowance of '₹1,500'' and stating that 'Every work trip needs your manager's approval before you book anything' and notes that trips 'above ₹40,000 also need the Finance Manager's approval'') are ranked far below multiple irrelevant nodes (such as the first node which is about 'This document is about working from home and other cities, which is irrelevant to booking flights and hotels for a client meeting in Pune.' and the second node which 'This part mentions Pune as an office location, but does not provide travel or hotel booking rules.'). To achieve a higher score, the relevant nodes should have been ranked at the very top.
- **#8 Context Precision (0.17)**: The score is 0.17 because the only relevant node is ranked sixth, failing to place it above the irrelevant nodes. Specifically, the first node was deemed irrelevant because "This part discusses general office days as '3 days a week' but does not mention the 5 days a week rule for the first 4 weeks.", the second node was deemed irrelevant because "This document introduces the hybrid work policy and office locations, but does not provide the specific number of office days required.", the third node was deemed irrelevant because "This section covers exceptions for medical or caregiving needs and is unrelated to the standard office attendance schedule.", the fourth node was deemed irrelevant because "This covers core hours and unexcused absences, simply stating that 'Office days and work-from-home rules are in the Hybrid Work Policy' without giving details.", and the fifth node was deemed irrelevant because "This part discusses working from home and other cities, which is irrelevant to the initial office attendance requirement.", all of which should have been ranked lower than the sixth node which actually "directly provides the expected answer: 'For your first 4 weeks you work from the office 5 days a week... After that you follow the normal hybrid rule of 3 days a week, on the anchor days Tuesday, Wednesday and Thursday.'".
- **#11 Context Precision (0.25)**: The score is 0.25 because the only relevant node is ranked fourth, failing to prioritize the correct information. The fourth node in the retrieval contexts is relevant because 'This document explicitly states under milestones that the 'Beta with 200 Bharat Freight drivers' starts on '18 January 2027'.' In contrast, the first node in the retrieval contexts is irrelevant because 'This part of the charter discusses daily standups, sprints, and tickets, which is irrelevant to the start date and driver count of the Falcon beta.', the second node in the retrieval contexts is irrelevant because 'This document outlines the project goals and launch customer details ('Bharat Freight'), but does not specify the beta start date.', the third node in the retrieval contexts is irrelevant because 'This section covers team roles and the definition of done, which does not address when the beta starts or how many drivers are in it.', the fifth node in the retrieval contexts is irrelevant because 'This part details project risks, sync conflicts, and customer contact rules, none of which contain the beta date or driver count.', and the sixth node in the retrieval contexts is irrelevant because 'This document outlines QA bug triage and testing standards, which has no information about the Falcon beta start date or driver count.' These irrelevant nodes should have been ranked lower than the relevant node.

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

- **Asked as:** bt23103122 Piyush Kumar (Intern) · route `read` · 12.5 s
- **Searched for:** "internship paid leave days" · rewrites: 0
- **Documents in the results:** intern-program-guide, org-leave-and-holidays-2027 (should include `intern-program-guide.docx`)
- **Expected:** 1 day of paid leave for each month of the internship, so 6 days in total. It doesn't carry over beyond the internship and isn't paid out when you leave.
- **Agent answered:** You earn 1 day of paid leave for each month of your internship, giving you a total of 6 days.

### 2. How many earned leave days do I get in 2027, and how many can I carry forward?

- **Asked as:** Piyush Kumar (Software Engineer) · route `read` · 7.5 s
- **Searched for:** "earned leave 2027 carry forward" · rewrites: 0
- **Documents in the results:** org-code-of-conduct, org-leave-and-holidays-2027 (should include `org-leave-and-holidays-2027.docx`)
- **Expected:** 20 earned leave days a year, building up at 1.67 days per month worked. Up to 10 unused earned leave days carry forward to 2028; anything above 10 lapses on 31 December 2027.
- **Agent answered:** In 2027, you get **20 earned leave days**, which build up at 1.67 days per month worked. 

Regarding carrying them forward:
* Up to **10 unused earned leave days** can be carried forward to 2028.
* Anything above 10 unused earned leave days will lapse on 31 December 2027.

### 3. Is Good Friday a holiday?

- **Asked as:** Piyush Kumar (Software Engineer) · route `read` · 7.3 s
- **Searched for:** "Good Friday" · rewrites: 0
- **Documents in the results:** eng-engineering-handbook, org-leave-and-holidays-2027 (should include `org-leave-and-holidays-2027.docx`)
- **Expected:** Good Friday (Friday 26 March 2027) is an optional holiday, not a fixed one. Everyone may take 2 optional holidays from a list of 4 (Pongal, Good Friday, Eid al-Adha, Raksha Bandhan), applied for in the HR portal at least 7 days before.
- **Agent answered:** Yes, Good Friday (26 March 2027) is listed as a company holiday.

### 4. How many company holidays in 2027 fall on a weekend?

- **Asked as:** Student Test (HR Executive) · route `read` · 6.9 s
- **Searched for:** "holidays 2027" · rewrites: 0
- **Documents in the results:** org-hybrid-work-policy, org-leave-and-holidays-2027 (should include `org-leave-and-holidays-2027.docx`)
- **Expected:** 3: Independence Day (Sunday 15 August), Gandhi Jayanti (Saturday 2 October) and Christmas (Saturday 25 December). Holidays that fall on a weekend are not moved to a weekday.
- **Agent answered:** In 2027, there are 3 company holidays that fall on a weekend:

- **15 August 2027** (Independence Day) – Sunday
- **2 October 2027** (Gandhi Jayanti) – Saturday
- **25 December 2027** (Christmas) – Saturday

### 5. I clicked a link in a suspicious email and typed my password. What should I do?

- **Asked as:** bt23103122 Piyush Kumar (Intern) · route `read` · 10.9 s
- **Searched for:** "suspicious email password phishing security incident" · rewrites: 0
- **Documents in the results:** org-code-of-conduct, org-information-security-policy (should include `org-information-security-policy.pdf`)
- **Expected:** Report it to the security team within 30 minutes on #security-alerts or by calling the IT Helpdesk, then change your password. Reporting quickly is never punished; hiding it is a serious violation.
- **Agent answered:** According to the information security policy, if you clicked a phishing link or entered your password on a suspicious page, you should take the following steps:

* Report it to the security team within 30 minutes on `#security-alerts` or by calling the IT Helpdesk.
* Change your password immediately.

Reporting quickly is never punished, even if you clicked.

### 6. Can I fly to Pune for a client meeting, and what hotel can I book there?

- **Asked as:** Piyush Kumar (Software Engineer) · route `read` · 13.1 s
- **Searched for:** "Pune" · rewrites: 1
- **Documents in the results:** eng-engineering-handbook, intern-program-guide, org-hybrid-work-policy, org-leave-and-holidays-2027, org-travel-and-expense-policy (should include `org-travel-and-expense-policy.md`)
- **Expected:** Yes, in economy class only, when the train journey is longer than 8 hours or the client meeting is the same morning (with manager approval). Every trip needs your manager's approval before booking (above Rs 40,000 also the Finance Manager's). Pune is a metro city: hotel up to Rs 5,000 per night including taxes, and a daily allowance of Rs 1,500.
- **Agent answered:** **Flight travel:**
You can fly to Pune for a client meeting even if the train journey is shorter, provided you have your manager's approval. All flights must be in **economy class**. Remember that every work trip also requires your manager's prior approval via a travel request in the Kestrel Expense portal before booking.

**Hotel booking:**
Pune is classified as a Metro city under the travel policy, so you can book a hotel up to **₹5,000 per night (including taxes)**.

### 7. How many days a week do I need to be in the office, and which days?

- **Asked as:** Piyush Kumar (Software Engineer) · route `read` · 8.2 s
- **Searched for:** "office days in office remote hybrid policy" · rewrites: 0
- **Documents in the results:** intern-program-guide, org-code-of-conduct, org-hybrid-work-policy (should include `org-hybrid-work-policy.md`)
- **Expected:** 3 days a week, normally the anchor days Tuesday, Wednesday and Thursday. Teams may agree other days in writing with their Engineering Manager, but at least 2 of the 3 must be anchor days.
- **Agent answered:** You need to be in the office **3 days a week**. 

**Tuesday, Wednesday, and Thursday are anchor days**, so your three office days should normally be these. (Teams may agree on different days in writing with their Engineering Manager, provided at least 2 of the 3 days are anchor days.)

### 8. How many days a week do I have to come to the office?

- **Asked as:** bt23103122 Piyush Kumar (Intern) · route `read` · 7.7 s
- **Searched for:** "office days hybrid remote policy attendance" · rewrites: 0
- **Documents in the results:** intern-program-guide, org-code-of-conduct, org-hybrid-work-policy (should include `intern-program-guide.docx`)
- **Expected:** 5 days a week for the first 4 weeks, then 3 days a week on the anchor days Tuesday, Wednesday and Thursday.
- **Agent answered:** Everyone is required to come to the office **3 days a week**. 

Key details from the policy:
- **Anchor days:** Tuesday, Wednesday, and Thursday are designated as anchor days for team rituals, design reviews, and all-hands, so your three office days should normally be these.
- **Exceptions:** Teams may agree on different days in writing with their Engineering Manager, provided at least 2 of the 3 days are anchor days.
- **Attendance tracking:** Attendance is tracked via your ID card, and coming in fewer than 8 days in a calendar month without approved leave will be raised with your manager.

### 9. How fast must I acknowledge a P1 incident when I'm on call, and what is the on-call allowance?

- **Asked as:** Piyush Kumar (Software Engineer) · route `read` · 8.2 s
- **Searched for:** "P1 incident on-call acknowledge allowance" · rewrites: 0
- **Documents in the results:** eng-engineering-handbook, org-hybrid-work-policy, org-leave-and-holidays-2027, org-travel-and-expense-policy (should include `eng-engineering-handbook.md`)
- **Expected:** Within 15 minutes. The allowance is Rs 3,000 per week on call plus Rs 1,500 for each night you are paged between 23:00 and 07:00.
- **Agent answered:** - **P1 Incident Acknowledgement:** You must acknowledge a P1 incident within **15 minutes**.
- **On-Call Allowance:** You receive **₹3,000 per week** on call, plus **₹1,500 for each night** you are paged between 23:00 and 07:00.

### 10. What time is the Falcon standup?

- **Asked as:** bt23103122 Piyush Kumar (Intern) · route `read` · 5.6 s
- **Searched for:** "Falcon standup" · rewrites: 0
- **Documents in the results:** falcon-project-charter, org-code-of-conduct, org-hybrid-work-policy (should include `falcon-project-charter.md`)
- **Expected:** 10:00 IST, 15 minutes, on Google Meet (link pinned in #falcon-dev). On anchor days (Tuesday to Thursday) it is in the Garuda meeting room instead.
- **Agent answered:** The Falcon daily standup is at **10:00 IST** for 15 minutes. It is held on Google Meet (with the link pinned in `#falcon-dev`), except on anchor days (Tuesday to Thursday) when the team meets in the Garuda meeting room.

### 11. When does the Falcon beta start and how many drivers are in it?

- **Asked as:** Jayant Kumar Thakur (Engineering Manager) · route `read` · 10.9 s
- **Searched for:** "Falcon beta start drivers" · rewrites: 0
- **Documents in the results:** falcon-project-charter, qa-testing-and-release-standards (should include `falcon-project-charter.md`)
- **Expected:** 18 January 2027, with 200 Bharat Freight drivers.
- **Agent answered:** The Falcon beta starts on **18 January 2027** and includes **200 Bharat Freight drivers**.

### 12. What does someone need to get promoted?

- **Asked as:** Jayant Kumar Thakur (Engineering Manager) · route `read` · 9.6 s
- **Searched for:** "promotion" · rewrites: 0
- **Documents in the results:** em-performance-review-cycle, eng-engineering-handbook, intern-program-guide (should include `em-performance-review-cycle.pptx`)
- **Expected:** A rating of 4 or 5 in two annual reviews in a row, and a nomination by their manager in the HR portal by 20 April with a one-page case. E3 to E4 also needs a design document the person led. Promotions are capped at 15% of a team per cycle and decided in calibration.
- **Agent answered:** To get promoted, someone needs to meet the following requirements:

* **Performance Ratings:** Be rated 4 or 5 in two annual reviews in a row.
* **Nomination:** Have a manager nominate them in the HR portal by April 20 with a one-page case.
* **Design Document (E3 to E4):** For promotions from E3 to E4, provide a design document that the person led.
* **Team Cap:** Promotions are capped at 15% of a team in one cycle.
* **Calibration:** The final decision is made in calibration, not by the manager alone.

### 13. How much overtime can I approve for one person?

- **Asked as:** Jayant Kumar Thakur (Engineering Manager) · route `read` · 41.7 s
- **Searched for:** "overtime approval limit" · rewrites: 0
- **Documents in the results:** em-engineering-manager-playbook, em-performance-review-cycle (should include `em-engineering-manager-playbook.md`)
- **Expected:** Up to 10 hours per week per person. More than 10 hours a week, or overtime for more than 3 weeks in a row, needs the HR Manager's approval.
- **Agent answered:** You can approve overtime up to **10 hours per week** per person. 

Any overtime above 10 hours a week, or overtime for more than 3 weeks in a row, requires the HR Manager's approval.

### 14. What is the notice period for a Staff Engineer?

- **Asked as:** Student Test (HR Executive) · route `read` · 23.8 s
- **Searched for:** "notice period Staff Engineer"; "Staff Engineer level"; "Staff Engineer level E"; "Staff Engineer" · rewrites: 0
- **Documents in the results:** hr-recruitment-and-onboarding, org-code-of-conduct, org-hybrid-work-policy, org-leave-and-holidays-2027 (should include `hr-recruitment-and-onboarding.md`)
- **Expected:** 60 days (levels E3 and E4) after probation; 15 days during probation.
- **Agent answered:** The notice period for a Staff Engineer depends on their employment status:

* **During probation:** **15 days** on both sides.
* **After probation:** Staff Engineers fall under level E5 (or Engineering Managers and above), which requires a **90-day** notice period. 

The HR Manager may shorten the notice period once the handover is complete, but leave cannot be used to shorten notice unless the manager agrees in writing.

### 15. What is the salary band for a Senior Software Engineer?

- **Asked as:** Piyush Kumar (Admin) · route `read` · 8.7 s
- **Searched for:** "salary band Senior Software Engineer" · rewrites: 0
- **Documents in the results:** eng-engineering-handbook, hr-compensation-and-payroll (should include `hr-compensation-and-payroll.txt`)
- **Expected:** E3 Senior Software Engineer: Rs 15 lakh to Rs 24 lakh annual CTC.
- **Agent answered:** The salary band (annual CTC for FY 2026-27) for a Senior Software Engineer (Level E3) is from **Rs 15 lakh to Rs 24 lakh**.

### 16. Which invoices need two signatures?

- **Asked as:** Piyush Kumar (Admin) · route `read` · 8.1 s
- **Searched for:** "invoice signatures" · rewrites: 0
- **Documents in the results:** falcon-project-charter, finance-approvals-and-payments, org-travel-and-expense-policy (should include `finance-approvals-and-payments.pdf`)
- **Expected:** Invoices above Rs 5,00,000 need two signatures: the Finance Manager and an Admin.
- **Agent answered:** Invoices above ₹5,00,000 need two signatures: the Finance Manager and an Admin.

### 17. How long is chat history kept in Trellis?

- **Asked as:** Piyush Kumar (Admin) · route `read` · 8.7 s
- **Searched for:** "chat history retention" · rewrites: 0
- **Documents in the results:** admin-workspace-governance, em-engineering-manager-playbook, org-code-of-conduct, org-information-security-policy (should include `admin-workspace-governance.md`)
- **Expected:** 180 days, then it is deleted automatically.
- **Agent answered:** Chat history in Trellis is kept for 180 days, after which it is deleted automatically.

### 18. What has to be true before QA can sign off a release?

- **Asked as:** Jayant Kumar Thakur (Engineering Manager) · route `read` · 8.4 s
- **Searched for:** "QA sign off release criteria" · rewrites: 0
- **Documents in the results:** falcon-project-charter, qa-testing-and-release-standards (should include `qa-testing-and-release-standards.md`)
- **Expected:** Zero open P1 and P2 bugs; no more than 5 open P3 bugs, each with a ticket for the next sprint; the full regression suite passed on the release build within the last 24 hours; smoke tests passed on at least one real Android and one real iOS device; release notes reviewed.
- **Agent answered:** According to the QA testing and release standards, QA may sign off a release only when all of the following conditions are met:

1. **Zero open P1 and zero open P2 bugs** in the release.
2. **No more than 5 open P3 bugs**, and each must have a ticket scheduled for the next sprint.
3. The **full regression suite has passed** on the release build within the last 24 hours.
4. **Smoke tests have passed** on at least one real Android device and one real iOS device.
5. **Release notes have been reviewed**.

### 19. What is the salary band for a Senior Software Engineer?

- **Asked as:** bt23103122 Piyush Kumar (Intern) · route `read` · 25.4 s
- **Searched for:** "salary band Senior Software Engineer" · rewrites: 2
- **Documents in the results:** intern-program-guide, org-code-of-conduct, org-hybrid-work-policy, org-travel-and-expense-policy (must not include `hr-compensation-and-payroll`)
- **Expected:** no answer. Salary bands are only in the HR Manager's document.
- **Agent answered:** I couldn't find the salary band for a Senior Software Engineer in the documents you can access. I suggest asking your manager or HR for this information.

### 20. What increment does someone rated 4 get?

- **Asked as:** Student Test (HR Executive) · route `read` · 16.6 s
- **Searched for:** "rated 4 increment" · rewrites: 2
- **Documents in the results:** hr-recruitment-and-onboarding, org-code-of-conduct, org-leave-and-holidays-2027, org-travel-and-expense-policy (must not include `hr-compensation-and-payroll`)
- **Expected:** no answer. HR Executive sits below HR Manager, so the compensation document is out of reach.
- **Agent answered:** I couldn't find information about salary increment percentages for a rating of 4 in the documents you can access. 

Since compensation guidelines aren't in the available documents, I suggest asking your manager or HR for details on how a rating of 4 affects your increment.

### 21. What is the salary band for an Engineering Manager?

- **Asked as:** Jayant Kumar Thakur (Engineering Manager) · route `read` · 18.1 s
- **Searched for:** "salary band Engineering Manager" · rewrites: 2
- **Documents in the results:** em-engineering-manager-playbook, em-performance-review-cycle, eng-engineering-handbook (must not include `hr-compensation-and-payroll`)
- **Expected:** no answer. Managers never see the full salary tables.
- **Agent answered:** I couldn't find information about the salary band for an Engineering Manager in the documents you can access. I recommend asking your manager or HR for this information.

### 22. How much overtime can my manager approve?

- **Asked as:** Piyush Kumar (Software Engineer) · route `read` · 17.3 s
- **Searched for:** "overtime manager approve hours limit" · rewrites: 2
- **Documents in the results:** eng-engineering-handbook, org-code-of-conduct, org-leave-and-holidays-2027, org-travel-and-expense-policy (must not include `em-engineering-manager-playbook`)
- **Expected:** no answer. The manager playbook is shared with Engineering Manager, above Software Engineer.
- **Agent answered:** I couldn't find the answer to this in the documents you can access. I recommend asking your manager or HR for details on overtime approval limits.

### 23. How many approvals does a pull request touching payments code need?

- **Asked as:** bt23103122 Piyush Kumar (Intern) · route `read` · 23.0 s
- **Searched for:** "payments pull request approvals" · rewrites: 2
- **Documents in the results:** falcon-project-charter, org-code-of-conduct, org-travel-and-expense-policy (must not include `eng-engineering-handbook`)
- **Expected:** no answer. The engineering handbook is shared with Software Engineer, above Intern.
- **Agent answered:** I couldn't find information about the number of approvals required for pull requests touching payments code in the documents you can access. 

I suggest asking your manager or HR for guidance on this process.

### 24. What are QA's conditions for signing off a release?

- **Asked as:** Piyush Kumar (Software Engineer) · route `read` · 25.9 s
- **Searched for:** "QA sign off release conditions"; "release sign off QA conditions criteria"; "release sign-off QA criteria"; "beta build sign-off QA" · rewrites: 0
- **Documents in the results:** eng-engineering-handbook, falcon-project-charter (must not include `qa-testing-and-release-standards`)
- **Expected:** no answer. QA Engineer is a sibling of Software Engineer, not below it.
- **Agent answered:** Based on the project documents, QA's role regarding releases includes:

* **Device Testing and Sign-Off:** The QA Engineer is responsible for device testing and release sign-off for each beta build.
* **Ticket Verification:** QA verifies tickets on a staging build as part of the Definition of Done.
* **Release Train:** The mobile Driver app ships on a release train that is run by QA every second Wednesday.

The available documents do not list a granular checklist of specific conditions or criteria required for QA to grant a sign-off.

### 25. When is the Falcon design freeze?

- **Asked as:** Student Test (HR Executive) · route `read` · 20.1 s
- **Searched for:** "Falcon design freeze" · rewrites: 2
- **Documents in the results:** org-code-of-conduct, org-hybrid-work-policy, org-information-security-policy, org-leave-and-holidays-2027 (must not include `falcon-project-charter`)
- **Expected:** no answer. HR Executive is not on Project Falcon and not above its members.
- **Agent answered:** I couldn't find the date for the Falcon design freeze in the documents you can access. I recommend asking your manager or HR for this information.

### 26. Which invoices need two signatures?

- **Asked as:** Jayant Kumar Thakur (Engineering Manager) · route `read` · 15.6 s
- **Searched for:** "invoice signature" · rewrites: 2
- **Documents in the results:** em-engineering-manager-playbook, eng-engineering-handbook, falcon-project-charter, org-code-of-conduct, org-information-security-policy, org-travel-and-expense-policy (must not include `finance-approvals-and-payments`)
- **Expected:** no answer. Finance procedures are shared with Finance Manager only (and Admin above it).
- **Agent answered:** I couldn't find information about which invoices need two signatures in the documents you can access. 

I suggest asking your manager or HR for guidance on this.

### 27. How long is chat history kept in Trellis?

- **Asked as:** Piyush Kumar (Software Engineer) · route `read` · 18.7 s
- **Searched for:** "chat history retention Trellis" · rewrites: 2
- **Documents in the results:** eng-engineering-handbook, org-code-of-conduct, org-information-security-policy (must not include `admin-workspace-governance`)
- **Expected:** no answer. Workspace governance is for Admins only.
- **Agent answered:** I couldn't find the answer to how long chat history is kept in Trellis in the documents you can access. I'd suggest asking your manager or HR for this information.
