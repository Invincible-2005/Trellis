# Kestrel Software: the evaluation org (round 2)

A made-up but realistic company used for the second agent evaluation. **Kestrel Software Pvt Ltd** is a ~180-person software company in Bengaluru and Pune that makes **KestrelTrack**, a delivery-tracking app for logistics firms. All facts are invented for testing, and they agree across documents.

Don't upload this README. Upload the 15 files in `documents/`.

## 1. Create the org (web app)

Sign in with your main account, create a new organization called **Kestrel Software**, and finish the setup page. You become its **Admin**.

## 2. Create these roles (Admin → Roles), in this order

```
Admin  (already exists)
├── Engineering Manager
│   ├── Software Engineer
│   │   └── Intern
│   └── QA Engineer
├── HR Manager
│   └── HR Executive
└── Finance Manager
```

| Role | Parent | Permissions | Description |
|---|---|---|---|
| Engineering Manager | Admin | create team, assign task, give strike, upload document, view aggregate | Runs an engineering team |
| Software Engineer | Engineering Manager | none | Builds and runs KestrelTrack |
| Intern | Software Engineer | none | 6-month engineering intern |
| QA Engineer | Engineering Manager | none | Testing and release sign-off |
| HR Manager | Admin | add member, upload document, view aggregate, review strike | Owns HR policy, pay and escalated strikes |
| HR Executive | HR Manager | none | Runs hiring, joining and exits |
| Finance Manager | Admin | upload document, view aggregate | Approvals, payments, month-end close |

Intern sits **under** Software Engineer on purpose: engineers mentor interns, so they can see the intern guide, but interns can't see the engineering handbook. That gives the tree four levels to test.

## 3. Add people (Admin → Members → Add by email)

| Person | Account | Org role | Team |
|---|---|---|---|
| Admin | Piyush (main) | Admin | none |
| Engineering Manager | Jayant | Engineering Manager | Project Falcon (as Engineering Manager) |
| Software Engineer | Piyush (second account) | Software Engineer | Project Falcon (as Software Engineer) |
| Intern | **new account** | Intern | Project Falcon (as Intern) |
| HR Executive | Student Test | HR Executive | none |
| Finance Manager | **new account** | Finance Manager | none |

The two new accounts can be Gmail "plus" addresses of an inbox you already have (e.g. `yourname+intern@gmail.com`, `yourname+finance@gmail.com`). Clerk treats each as a separate person and the invite lands in your normal inbox.

QA Engineer and HR Manager have **no person** on purpose. Their documents are still tested through the roles above them and through "must not answer" questions.

## 4. Create the team (Admin, Teams → New team)

**Project Falcon**, with the three members shown above.

## 5. Upload (Admin → Documents → Upload & share)

Wait for each to show **Ready**. ✓ = that person should be able to get answers from it.

| File | Format | Share with | Admin | Eng Mgr | Software Eng | Intern | HR Exec | Finance Mgr |
|---|---|---|---|---|---|---|---|---|
| `org-code-of-conduct.md` | md | Whole organization | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `org-hybrid-work-policy.md` | md | Whole organization | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `org-travel-and-expense-policy.md` | md | Whole organization | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `org-leave-and-holidays-2027.docx` | **docx** | Whole organization | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `org-information-security-policy.pdf` | **pdf** | Whole organization | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `eng-engineering-handbook.md` | md | Role → Software Engineer | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| `intern-program-guide.docx` | **docx** | Role → Intern | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| `qa-testing-and-release-standards.md` | md | Role → QA Engineer | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| `em-engineering-manager-playbook.md` | md | Role → Engineering Manager | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| `em-performance-review-cycle.pptx` | **pptx** | Role → Engineering Manager | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| `hr-recruitment-and-onboarding.md` | md | Role → HR Executive | ✓ | ✗ | ✗ | ✗ | ✓ | ✗ |
| `hr-compensation-and-payroll.txt` | **txt** | Role → HR Manager | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| `finance-approvals-and-payments.pdf` | **pdf** | Role → Finance Manager | ✓ | ✗ | ✗ | ✗ | ✗ | ✓ |
| `falcon-project-charter.md` | md | Team → Project Falcon | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| `admin-workspace-governance.md` | md | Role → Admin | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |

## 6. Traps built into the documents

These are deliberate, so the evaluation can catch the agent using the wrong document:

- **Same question, different answer by role:** an engineer gets 20 earned leave days (leave policy), while an intern gets 1 day a month, 6 in total (intern guide).
- **Answer exists, but not for you:** salary bands and increment percentages are only in the HR Manager document. The HR Executive, Engineering Manager and everyone else must be told it isn't in their documents.
- **Two documents needed:** for example, "Can I fly to Pune for a client meeting and what hotel can I book?" combines the transport and hotel tables.
- **A Word table with no heading near it:** the app's Word reader puts tables at the end of the text, so the optional-holiday rows (Good Friday, etc.) lose their "optional" heading. Asking "Is Good Friday a holiday?" checks whether the agent confuses optional with fixed holidays.
- **Close numbers:** ₹40,000 (manager approval limit) appears in the travel policy, the manager playbook and the finance procedures; ₹2,500 is both the client-dinner limit per person and the team-events budget per person per quarter.
