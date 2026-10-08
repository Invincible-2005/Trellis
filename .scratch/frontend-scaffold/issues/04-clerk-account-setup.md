# 04 � Clerk Account and API Keys Setup
Type: task
Status: open

## Question

Before any auth wiring can be tested or finalized, a Clerk account and application must exist. This is a prerequisite task � a human must do it.

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
- [ ] ~~Sessions -> Customize session token: add custom claims
      `{"email": "{{user.primary_email_address}}", "name": "{{user.full_name}}"}`~~
      **Superseded 2026-10-08:** not needed. The backend fetches the primary email and name from the Clerk Backend API on first login (trellis ticket 13 step A, B2).
- [ ] Note the **Frontend API URL** -> backend `CLERK_ISSUER`; JWKS URL is derived from it automatically (`<issuer>/.well-known/jwks.json`); there is no separate `CLERK_JWKS_URL` setting
- [ ] Backend `.env`: `CLERK_SECRET_KEY` (Backend API: provisioning, invitations, removals), `CLERK_AUTHORIZED_PARTIES` (e.g. `http://localhost:3000`)
- [ ] Decode one real session token (with an active org) and record whether org claims are v2 (`o.id`, `o.rol`) or v1 (`org_id`, `org_role`)

## Decided 2026-10-08 (Piyush): use the teammate's existing Clerk app

There is **one shared Clerk application** (the teammate's existing one) and **one development instance** for everyone. A token minted by the frontend must verify on the backend, so the frontend `.env.local` and `backend/.env` must use keys from the **same** instance.

**For the app owner to execute:**
- [ ] Organizations: **on**. "Allow users to create organizations": **on** (D10).
- [ ] Personal accounts: **off** ("membership required"). The UI already uses `hidePersonal`.
- [ ] The default role for an org's creator stays **`org:admin`**. `POST /api/v1/orgs/provision` checks it once, to bootstrap the org.
- [ ] Session token: leave at Clerk's default. **No custom claims** (see the superseded item above).
- [ ] Add Piyush (backend) as a member of the Clerk dashboard.
- [ ] Share **privately, never in git or chat logs**:
  - the publishable key and secret key (frontend `.env.local`);
  - the Frontend API URL and secret key (backend `.env`: `CLERK_ISSUER`, `CLERK_SECRET_KEY`).
- [ ] Sign in to the running frontend with an active org. Copy the session token from the `__session` cookie, decode it (for example at jwt.io, which runs locally in the browser), and record below:
  - org claims: **v2** (`o.id`, `o.rol`) or **v1** (`org_id`, `org_role`);
  - the `azp` value. It becomes `CLERK_AUTHORIZED_PARTIES` on the backend.

**Recorded values:** _(fill in: claim format, azp)_
