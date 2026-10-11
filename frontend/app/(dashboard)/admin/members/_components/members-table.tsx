import React from "react";
import { Shield, User, Users } from "lucide-react";

import type { Member } from "@/lib/api/queries/members";

interface MembersTableProps {
  members: Member[];
}

export function MembersTable({ members }: MembersTableProps) {
  if (members.length === 0) {
    return (
      <div className="flex min-h-[220px] w-full flex-col items-center justify-center rounded-xl border border-dashed p-8 text-center bg-card/40">
        <Users className="h-9 w-9 text-muted-foreground/50 mb-2.5" />
        <h3 className="text-sm font-semibold text-foreground">No members found</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Invite teammates to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full overflow-hidden rounded-xl border bg-card shadow-xs">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-muted/40 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            <tr>
              <th className="px-5 py-3.5">Name</th>
              <th className="px-5 py-3.5">Email</th>
              <th className="px-5 py-3.5">Org Role</th>
              <th className="px-5 py-3.5">Joined</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {members.map((member) => (
              <tr key={member.user_id} className="hover:bg-muted/30 transition-colors">
                {/* Name */}
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary font-medium text-xs">
                      {member.name ? member.name.charAt(0).toUpperCase() : <User className="h-4 w-4" />}
                    </div>
                    <span className="font-medium text-foreground">{member.name || "Unnamed Member"}</span>
                  </div>
                </td>

                {/* Email */}
                <td className="px-5 py-3.5 text-muted-foreground">
                  {member.email}
                </td>

                {/* Org Role */}
                <td className="px-5 py-3.5 whitespace-nowrap">
                  {member.org_role_name ? (
                    <span className="inline-flex items-center gap-1.5 rounded-md bg-purple-500/10 px-2 py-0.5 text-xs font-medium text-purple-600 dark:text-purple-400">
                      <Shield className="h-3 w-3" />
                      {member.org_role_name}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground italic">
                      No role
                    </span>
                  )}
                </td>

                {/* Joined */}
                <td className="px-5 py-3.5 text-xs text-muted-foreground whitespace-nowrap">
                  {new Date(member.joined_at).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
