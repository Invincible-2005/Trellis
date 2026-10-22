# QA Testing and Release Standards

**Owner:** Engineering Manager (QA practice) · **For:** QA engineers · **Version:** 2.3, 15 August 2026

QA engineers at Kestrel own the quality gate for every release of KestrelTrack. This document sets out how we classify bugs, what we test on, and the exact conditions for signing off a release.

## 1. Bug severity

| Severity | Definition | Example | Fix expected within |
|---|---|---|---|
| P1 Critical | Blocks a core flow for all users, or risks data loss or a security breach | Drivers can't log in | Before release, always |
| P2 Major | Breaks a feature for many users with no workaround | Proof-of-delivery photos fail on Android 13 | Before release |
| P3 Minor | Broken behaviour with a workaround | Sorting by date is wrong on one report | Within 2 sprints |
| P4 Cosmetic | Visual or text issue | Misaligned button | When convenient |

Every bug report must include steps to reproduce, the build number, the device or browser, and a screenshot or screen recording.

## 2. Bug triage

- Triage meetings are on **Monday and Thursday at 12:00**, led by the QA engineer on duty, with the Engineering Manager and the tech lead.
- New P1 bugs are not held for triage: raise them immediately in #incidents.
- A bug can only be closed by QA after verifying the fix on the build that contains it.

## 3. What we test on

| Platform | Supported versions |
|---|---|
| Android (Driver app) | Android 12 and above |
| iOS (Driver app) | iOS 16 and above |
| Web dashboard | Latest two versions of Chrome, Edge and Safari |

Real devices for testing are in the QA device lab on the 4th floor. Devices can be borrowed for up to **3 days**, signed out in the device register.

## 4. Test suites

- **Smoke suite:** 40 checks, runs on every merge to `main`, must finish in under 10 minutes.
- **Regression suite:** runs **every night at 02:00 IST** against staging. Failures are posted to #qa-nightly by 07:00.
- **Automation target:** at least **70% of regression test cases automated**. The current figure is reported in the monthly QA review.
- New features need test cases written and reviewed by a second QA engineer **before** development finishes.

## 5. The mobile release train

- The Driver app ships on a **release train every second Wednesday**.
- The release branch is cut on the **Monday before** release at 10:00.
- **QA sign-off must be given at least 24 hours before** the release, so by Tuesday 10:00.
- Store submission is done by the Engineering Manager after sign-off.

## 6. Release sign-off criteria

QA may sign off a release only when **all** of these are true:

1. **Zero open P1 and zero open P2 bugs** in the release.
2. **No more than 5 open P3 bugs**, each with a ticket for the next sprint.
3. The full regression suite passed on the release build within the last 24 hours.
4. Smoke tests passed on at least one real Android and one real iOS device.
5. Release notes are reviewed.

If any condition fails, QA blocks the release. Only the **Admin** can override a QA block, and the override must be recorded in #release-decisions with a reason.

## 7. Hotfixes

- A hotfix is a release outside the train for a P1 bug.
- Hotfixes need a focused test plan, smoke tests and a check of the specific fix; the full regression is run within 24 hours after shipping.

## 8. Test data

- Use only the anonymised dataset or generated data. **Never** use real customer or driver data in tests, screenshots or bug reports.
- Test accounts are listed in the QA vault; don't create test accounts on production.
