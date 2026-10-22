# Project Falcon: Team Charter

**Team:** Project Falcon · **Owner:** Engineering Manager, Falcon · **Updated:** 12 October 2026

Project Falcon is the rebuild of the **KestrelTrack Driver app**, the mobile app that delivery drivers use to get routes, scan parcels and capture proof of delivery. Our launch customer is **Bharat Freight**, who will move 4,000 drivers to the new app.

## 1. Why we're doing this

The current Driver app is slow on low-end Android phones and crashes when drivers lose network in the middle of a delivery. Bharat Freight reported that **7% of deliveries** need a manual correction because of app problems. Falcon fixes this with an offline-first app.

## 2. Goals

1. **Offline-first:** a driver can finish a full route with no network and sync later.
2. **Fast:** the app opens in under **2 seconds** on a ₹10,000 Android phone.
3. **Fewer corrections:** reduce manual delivery corrections from 7% to **below 1%**.
4. **Crash-free sessions:** at least **99.5%**.

Out of scope for this release: route optimisation changes, the customer-facing tracking page, iOS tablets.

## 3. Milestones

| Milestone | Date |
|---|---|
| Design freeze | **13 November 2026** |
| Internal alpha (Kestrel staff only) | 7 December 2026 |
| Beta with 200 Bharat Freight drivers | **18 January 2027** |
| General availability (all 4,000 drivers) | **1 March 2027** |

After design freeze, any screen change needs the Engineering Manager's sign-off and is logged in the decision log.

## 4. How we work

- **Daily standup:** **10:00 IST, 15 minutes**, on Google Meet (link pinned in #falcon-dev). Anchor days (Tuesday to Thursday) we stand up in the Garuda meeting room instead.
- **Sprints:** 2 weeks, starting on a Monday.
- **Sprint demo:** every second **Friday at 16:00**, with a Bharat Freight product owner joining remotely.
- **Retro:** after the demo, 30 minutes, team only.
- **Tickets:** Jira project key **FAL**. Every pull request mentions its FAL ticket.
- **Channel:** #falcon-dev for work, #falcon-alerts for crash reports from the beta.

## 5. Roles in the team

| Role | Responsibility |
|---|---|
| Engineering Manager | Scope, deadlines, customer communication, strikes and approvals |
| Software Engineers | Offline sync engine, scanning, proof-of-delivery screens |
| QA Engineer | Device testing and release sign-off for each beta build |
| Interns | Settings screens, analytics events, and the app's accessibility checks |

## 6. Definition of done

A FAL ticket is done when the code is merged with review, tested on one low-end Android device (the Redmi test phone in the device lab), analytics events are added, and the QA engineer has verified it on a staging build.

## 7. Risks

| Risk | Plan |
|---|---|
| Sync conflicts when two devices edit one delivery | Server wins, driver sees a conflict banner; tested weekly with the conflict test script |
| Bharat Freight delays driver onboarding for beta | Fallback: beta with 50 of our own test drivers in Bengaluru |
| Low-end phones run out of storage | Photos compressed to under **300 KB** each and deleted after sync |

## 8. Customer contact

Only the Engineering Manager talks to Bharat Freight about dates or scope. Engineers may join technical calls but shouldn't promise features or dates.
