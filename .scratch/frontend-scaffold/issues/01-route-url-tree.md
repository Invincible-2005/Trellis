# 01 — Route URL Tree and Page Inventory
Type: grilling
Status: open

## Question

What are ALL the routes/pages in the Trellis frontend, what are their exact URLs, which auth route group do they live in (`(public)`, `(authenticated)`, `(admin)`), and what layout does each group share?

This is the most foundational ticket: every other frontend decision depends on knowing the complete page inventory and the URL structure.

Decisions this ticket must lock:
- Complete list of all pages with their URL paths
- Which route group each page belongs to
- What shared layout each route group renders (sidebar, topbar, none)
- Which pages are server-rendered vs. need client interactivity
- The org-context URL pattern (is org ID in the URL, e.g. `/org/[orgId]/dashboard`, or is it a session variable from Clerk?)
