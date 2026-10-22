# Workspace Governance (Admins only)

**Owner:** Admin · **For:** people holding the Admin role in Trellis · **Version:** 1.2, 1 October 2026

Admins hold every permission in Kestrel's Trellis workspace and in our other company systems. This document lists the rules Admins follow so that this power is used carefully.

## 1. Who may be an Admin

- At most **2 people** may hold the Admin role at any time: currently the CEO and the Head of Operations.
- Adding or removing an Admin needs the written agreement of **both** existing Admins.
- Admin accounts must use a hardware security key for sign-in, not an authenticator app.

## 2. Roles and permissions

- New roles are created by an Admin or by someone with the "create role" permission, always **below** their own role.
- Before creating a role, check that an existing role can't be reused. We aim for **fewer than 15 roles** in total.
- Each role is reviewed every quarter: does it still have members, and are its permissions still needed?
- The Admin role itself can't be deleted, renamed or have permissions removed.

## 3. Quarterly access review

- Every quarter (**first week of January, April, July and October**), the Admins and the HR Manager review:
  - every member's org-level role,
  - every team's members,
  - everyone who left in the quarter, to confirm their access is gone.
- The review is recorded in #admin-log with the date and any changes.

## 4. Documents

- Policy documents shared with the whole organization must be approved by their owner (named at the top of each document) before upload.
- Restricted documents (salaries, contracts, disciplinary cases) are shared only with the exact role that needs them, never with the whole organization.
- An outdated document is replaced by uploading the new version and deleting the old one the **same day**, so the chat assistant never answers from two versions.

## 5. Data retention

| Data | Kept for |
|---|---|
| Chat history in Trellis | **180 days**, then deleted automatically |
| Audit log (who did what) | **2 years** |
| Strikes and appeals | 3 years after the person leaves |
| Documents | Until deleted by an Admin or uploader |

Customers can request a copy of their data; these requests are answered within **30 days** by the Admin team.

## 6. Overrides and emergencies

- Admins may override a QA release block, but must record the reason in #release-decisions.
- **Break-glass access** to production (outside the normal approval flow) may only be used during a P1 incident, and must be reported to the other Admin **within 1 hour**.
- Every override is reviewed in the next quarterly access review.

## 7. Closing the workspace

Deleting the organization in Trellis is irreversible. It needs both Admins, a full export of documents and audit logs first, and a 30-day notice to all members.
