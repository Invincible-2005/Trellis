/**
 * app/(dashboard)/admin/members/page.tsx
 *
 * Server Component:
 * - Checks tab permission ('members' in active_org.admin_tabs).
 * - Fetches members (and pending invitations) and roles in parallel.
 * - Filters assignable roles and passes down to MembersView.
 */
import { redirect } from "next/navigation";

import { getAuthContext } from "@/lib/api/queries/auth";
import { getMembers } from "@/lib/api/queries/members";
import { getRoles } from "@/lib/api/queries/roles";
import { MembersView } from "./_components/members-view";

export default async function AdminMembersPage() {
  const ctx = await getAuthContext();

  const adminTabs = ctx.active_org?.admin_tabs ?? [];
  if (!adminTabs.includes("members")) {
    const firstOtherTab = adminTabs[0];
    redirect(firstOtherTab ? `/admin/${firstOtherTab}` : "/dashboard");
  }

  const [{ members, invitations }, allRoles] = await Promise.all([
    getMembers(),
    getRoles(),
  ]);

  const assignableRoles = allRoles.filter((r) => r.assignable);

  return (
    <MembersView
      members={members}
      invitations={invitations}
      assignableRoles={assignableRoles}
    />
  );
}
