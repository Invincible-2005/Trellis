# 03 - Scope Resolution Engine (`resolve_scope`)

- **Type**: `prototype`
- **Status**: `needs-triage`
- **Assignee**: Backend Dev & Agentic Lead
- **Blocked by**: 02

## Question

How does the backend securely compute and cache a user's exact `AccessScope` on every request?
- Given a `user_id` extracted from the verified Clerk JWT, resolve:
  - `allowed_team_ids`: List of team IDs the user belongs to or manages.
  - `accessible_role_ids`: The user's role ID plus all descendant role IDs whose documents this role is permitted to inspect.
- How to cache this in memory / Redis to avoid recursive SQL tree-traversals on every chat message while guaranteeing instant cache invalidation when an admin modifies roles?
