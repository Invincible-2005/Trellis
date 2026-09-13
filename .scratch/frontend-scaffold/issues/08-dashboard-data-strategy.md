# 08 — Dashboard Data Fetching Strategy
Type: grilling
Blocked by: 01, 03
Status: open

## Question

How does the role-scoped dashboard fetch and display data?

The PRD defines four dashboard views depending on the viewer role (Employee / Manager / HR+ / Admin). The same `resolve_scope()` backs dashboard queries and chatbot tools.

Decisions to lock:
- Is the dashboard a single `/dashboard` route that renders conditionally by role, or separate routes per role?
- Which data is fetched server-side (Server Component, initial load) vs. client-side (polling/TanStack Query)?
- Recharts: which specific chart types per role? (task completion trend, deadline countdown, team aggregate bar chart?)
- What is the polling strategy for task updates? (TanStack Query `refetchInterval`? How often?)
- Are dashboard metrics a dedicated FastAPI endpoint, or assembled from existing task/team endpoints?
