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


## Added 2026-10-08 (trellis ticket 12 D8/D10): extra Clerk dashboard settings

- [ ] Organizations -> Settings: allow users to **create organizations** (self-serve, D10)
- [ ] Organizations -> Settings: disable **personal accounts** (we always use hidePersonal)
- [ ] Sessions -> Customize session token: add custom claims
      `{"email": "{{user.primary_email_address}}", "name": "{{user.full_name}}"}`
      (FastAPI creates users just-in-time from these; confirm exact shortcode names in the dashboard)
- [ ] Note the **Frontend API URL** -> backend `CLERK_ISSUER`; JWKS -> `CLERK_JWKS_URL` (`<issuer>/.well-known/jwks.json`)
- [ ] Backend `.env`: `CLERK_SECRET_KEY` (Backend API: provisioning, invitations, removals), `CLERK_AUTHORIZED_PARTIES` (e.g. `http://localhost:3000`)
- [ ] Decode one real session token (with an active org) and record whether org claims are v2 (`o.id`, `o.rol`) or v1 (`org_id`, `org_role`)
