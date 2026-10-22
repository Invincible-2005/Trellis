# Engineering Handbook

**Owner:** Engineering Manager · **For:** software engineers at Kestrel (levels E1 to E5) · **Last reviewed:** 1 September 2026

This handbook is how the engineering team works day to day: how we write and review code, when we deploy, how on-call works, and what support you get to grow. QA engineers have their own testing and release standards; interns have the Intern Program Guide.

## 1. Engineering levels

| Level | Title | Typical experience |
|---|---|---|
| E1 | Associate Software Engineer | 0 to 2 years |
| E2 | Software Engineer | 2 to 4 years |
| E3 | Senior Software Engineer | 4 to 7 years |
| E4 | Staff Engineer | 7+ years |
| E5 | Principal Engineer | 10+ years |

Promotions between levels happen through the annual performance review. Your Engineering Manager can explain what the next level expects from you.

## 2. Our stack

- **Backend:** Python 3.12 with FastAPI, PostgreSQL 16, Redis for queues.
- **Web:** Next.js with TypeScript.
- **Mobile:** React Native (the KestrelTrack Driver app).
- **Infrastructure:** AWS Mumbai region (ap-south-1), Terraform, GitHub Actions for CI.

New services need an architecture note reviewed in the Tuesday design review before any code is written.

## 3. Writing and reviewing code

- We use **trunk-based development**: short-lived branches off `main`, merged within **2 days**.
- Every pull request needs **1 approving review**. Pull requests that touch **payments, authentication or customer data exports need 2 approvals**, one of them from an E3 or above.
- Keep pull requests under **400 changed lines** (excluding generated files). Bigger changes get split.
- CI must be green before merging. Never merge with a failing check "to fix later".
- **Review turnaround:** review requests must get a first response within **1 working day**.
- Pull requests from interns must be approved by their assigned mentor; a second reviewer is optional.

## 4. Deploying to production

- Web and backend deploy continuously through the pipeline, **Monday to Thursday, 10:00 to 17:00 IST**.
- **No deploys on Friday after 14:00**, on weekends, or on the working day before a company holiday.
- Urgent fixes outside these windows need approval from the Engineering Manager on #deploy-approvals, and the on-call engineer must be online.
- The mobile Driver app ships on the release train run by QA (every second Wednesday); you don't deploy it yourself.
- Production database migrations must be backward compatible and reviewed by an E3 or above.

## 5. On-call

- Every engineer from E2 upwards joins the on-call rotation after 3 months at Kestrel. E1 engineers shadow first.
- A rotation lasts one week. **Handover is on Monday at 10:00** in #oncall.
- **On-call allowance:** ₹3,000 per week on call, plus **₹1,500 for each night** you are paged between 23:00 and 07:00.
- Response times:

| Severity | Meaning | Acknowledge within |
|---|---|---|
| P1 | KestrelTrack down or customer data at risk | 15 minutes |
| P2 | A major feature broken for many customers | 1 hour |
| P3 | Minor bug, workaround available | Next working day |

- Every P1 gets a written **postmortem within 3 working days**, blameless, reviewed in the Thursday engineering sync.
- If you can't cover your shift, swap with a colleague and update the PagerDuty schedule; tell your Engineering Manager.

## 6. Working with production data

- Production access goes through the VPN and a short-lived access ticket approved by the Engineering Manager.
- Customer data may **never** be copied into staging, local machines or test fixtures. Use the anonymised dataset refreshed every Sunday.

## 7. Mentoring interns

Engineers at E2 and above may be assigned an intern. As a mentor you:

- Hold a **30-minute 1:1 with your intern every week**.
- Approve their pull requests (see section 3) and review their final project demo.
- Fill in the intern's mid-term and final evaluation forms in the HR portal.
- Get recognition for mentoring in your own performance review.

## 8. Growing as an engineer

- **Learning budget:** ₹30,000 per financial year (April to March) for courses, books, certifications and conferences. Unused budget does not carry over.
- Conference attendance needs Engineering Manager approval before registering (see the Travel and Expense Policy).
- Every engineer gets **one "focus Friday" per month** with no meetings, for learning or tech-debt work.
- Internal talks happen on the last Friday of the month at 16:00.

## 9. Who to ask

| Topic | Where |
|---|---|
| Build or CI broken | #eng-help |
| Production incident | #incidents, then page on-call |
| Access to a system | IT Helpdesk portal |
| Anything about your growth | Your Engineering Manager |
