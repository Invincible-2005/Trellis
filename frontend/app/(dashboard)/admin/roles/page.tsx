/**
 * app/(dashboard)/admin/roles/page.tsx
 *
 * Server Component:
 * - Re-checks permission for the roles tab (trellis/12 D4, frontend-scaffold/06).
 * - Fetches roles via getRoles() query.
 * - Passes role list and active org permissions to RoleFlowTree.
 */
import { redirect } from 'next/navigation';

import { getAuthContext } from '@/lib/api/queries/auth';
import { getRoles } from '@/lib/api/queries/roles';
import { RoleFlowTree } from './_components/role-flow-tree';

export default async function AdminRolesPage() {
  const ctx = await getAuthContext();

  const adminTabs = ctx.active_org?.admin_tabs ?? [];
  if (!adminTabs.includes('roles')) {
    // Redirect to first available tab or dashboard
    const firstOtherTab = adminTabs[0];
    redirect(firstOtherTab ? `/admin/${firstOtherTab}` : '/dashboard');
  }

  const roles = await getRoles();

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Role Hierarchy</h2>
        <p className="text-sm text-muted-foreground">
          View and manage organizational role structure, authority levels, and permissions.
          Click a role below yours to edit it or to share a document with it.
        </p>
      </div>

      <RoleFlowTree
        roles={roles}
        callerOrgRoleId={ctx.active_org?.org_role_id}
        callerOrgPermissions={ctx.active_org?.org_permissions ?? []}
      />
    </div>
  );
}
