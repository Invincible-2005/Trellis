# 04 — Clerk Account and API Keys Setup
Type: task
Status: open

## Question

Before any auth wiring can be tested or finalized, a Clerk account and application must exist. This is a prerequisite task — a human must do it.

Checklist:
- [ ] Create a Clerk account at https://clerk.com
- [ ] Create a new Clerk application named "Trellis"
- [ ] Enable the **Organizations** feature in the Clerk dashboard
- [ ] Copy `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`
- [ ] Create `frontend/.env.local` and add both keys (do NOT commit this file)
- [ ] Confirm the org selection flow works in the Clerk dashboard simulator

Record the publishable key (safe to share) and confirm `.env.local` location in the resolution comment.
