# 06 - Admin Console: Role Hierarchy & Org Management UI

- **Type**: `prototype`
- **Status**: `resolved` → answered by [frontend-scaffold/06](../../frontend-scaffold/issues/06-admin-console-architecture.md)
- **Assignee**: Frontend Dev
- **Blocked by**: 05

## Question

How should the Admin interface visualize and configure the organization hierarchy?
- Visual interactive Tree/DAG component for role creation and inheritance (e.g., using React Flow or hierarchical tree UI).
- Team creation and member assignment (assigning users to specific teams with designated roles).
- Document ingestion & tagging (uploading SOPs / guidelines and assigning them to a role/team).

## Answer

Answered in the frontend map: [frontend-scaffold/06 — Admin Console Component Architecture](../../frontend-scaffold/issues/06-admin-console-architecture.md).
Sub-routes `/admin/{roles,teams,documents,strikes}`, read-only React Flow tree with Dialog/Sheet editors,
two-step UploadThing modal for tagging (Org / Role / Team scope).
