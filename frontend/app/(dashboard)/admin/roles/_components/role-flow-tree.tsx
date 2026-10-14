'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useTheme } from 'next-themes';
import {
  ReactFlow,
  Controls,
  Background,
  type Node,
  type Edge,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Plus, Users } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { Role } from '@/lib/api/queries/roles';
import { useServerData } from '@/lib/query/use-server-data';
import { RoleNode, type RoleNodeData } from './role-node';
import { CreateRoleDialog } from './create-role-dialog';
import { EditRoleDialog } from './edit-role-dialog';
import { ROLES_KEY, useRoleChanges, type RoleRow } from './use-role-changes';

interface RoleFlowTreeProps {
  roles: Role[];
  callerOrgRoleId?: string | null;
  callerOrgPermissions?: string[];
}

const nodeTypes: NodeTypes = {
  role: RoleNode,
};

const NODE_WIDTH = 270;
const HORIZONTAL_GAP = 50;
const VERTICAL_GAP = 180;

/** Tree layout from the flat list: each role sits centred above its own sub-roles. */
function layoutTree(roles: RoleRow[]): { nodes: Node<RoleNodeData>[]; edges: Edge[] } {
  const ids = new Set(roles.map((r) => r.id));
  const children = new Map<string, RoleRow[]>();
  for (const role of roles) {
    if (role.parent_role_id && ids.has(role.parent_role_id)) {
      children.set(role.parent_role_id, [...(children.get(role.parent_role_id) ?? []), role]);
    }
  }
  const roots = roles.filter((r) => !r.parent_role_id || !ids.has(r.parent_role_id));

  const nodes: Node<RoleNodeData>[] = [];
  const edges: Edge[] = [];
  let nextColumn = 0;

  // A role with no sub-roles takes the next free column; a parent sits midway over its children.
  const place = (role: RoleRow): number => {
    const kids = children.get(role.id) ?? [];
    const kidColumns = kids.map(place);
    const column =
      kids.length === 0 ? nextColumn++ : (kidColumns[0] + kidColumns[kidColumns.length - 1]) / 2;

    nodes.push({
      id: role.id,
      type: 'role',
      position: { x: column * (NODE_WIDTH + HORIZONTAL_GAP), y: role.depth * VERTICAL_GAP },
      data: { role },
    });
    for (const kid of kids) {
      edges.push({
        id: `edge-${role.id}-${kid.id}`,
        source: role.id,
        target: kid.id,
        type: 'smoothstep',
        style: { stroke: 'var(--border)', strokeWidth: 2 },
      });
    }
    return column;
  };
  roots.forEach(place);

  return { nodes, edges };
}

export function RoleFlowTree({
  roles: serverRoles,
  callerOrgRoleId,
  callerOrgPermissions = [],
}: RoleFlowTreeProps) {
  // The server's list, kept in TanStack so changes show instantly (use-role-changes.ts).
  const roles = useServerData<RoleRow[]>(ROLES_KEY, serverRoles);
  const { create, edit, remove } = useRoleChanges();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const { resolvedTheme } = useTheme();

  // Hydration guard: next-themes can only read localStorage on the client.
  // During SSR (and the first synchronous client render), resolvedTheme is
  // always treated as "light" so the server HTML and the initial client tree
  // are identical. After mount the real resolvedTheme takes over without a
  // mismatch warning.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const flowColorMode = mounted && resolvedTheme === 'dark' ? 'dark' : 'light';

  // Create, edit and delete all need org-wide create_role (the backend checks again).
  const canManageRoles = callerOrgPermissions.includes('create_role');

  const { nodes, edges } = useMemo(() => layoutTree(roles), [roles]);

  return (
    <div className="flex flex-col h-[calc(100vh-14rem)] w-full rounded-xl border bg-background shadow-xs overflow-hidden">
      {/* ── Toolbar Header ─────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b px-5 py-3 bg-card/60 backdrop-blur-xs">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Users className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">Hierarchy Canvas</h2>
            <p className="text-xs text-muted-foreground">
              {roles.length} {roles.length === 1 ? 'role' : 'roles'} in organization
              {canManageRoles && ' · click a role below yours to edit it'}
            </p>
          </div>
        </div>

        {canManageRoles && (
          <Button
            size="sm"
            onClick={() => setCreateDialogOpen(true)}
            className="flex items-center gap-1.5"
          >
            <Plus className="h-4 w-4" />
            Create Role
          </Button>
        )}
      </div>

      {/* ── Canvas Area ────────────────────────────────────────── */}
      <div className="flex-1 w-full h-full relative bg-muted/20">
        {nodes.length === 0 ? (
          <div className="flex h-full w-full flex-col items-center justify-center text-center p-6 text-muted-foreground">
            <Users className="h-10 w-10 stroke-1 mb-2 text-muted-foreground/60" />
            <p className="font-medium text-sm">No roles found</p>
            <p className="text-xs mt-1">Get started by creating a role.</p>
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            // View-only canvas: roles change through the dialogs (frontend ticket 06 §2)
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            onNodeClick={(_, node) => {
              if (canManageRoles && node.data.role.manageable) setEditingRole(node.data.role);
            }}
            colorMode={flowColorMode}
            fitView
            fitViewOptions={{ padding: 0.3 }}
            minZoom={0.2}
            maxZoom={1.5}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={16} size={1} />
            <Controls showInteractive={false} position="bottom-right" />
          </ReactFlow>
        )}
      </div>

      {/* ── Dialogs ────────────────────────────────────────────── */}
      <CreateRoleDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        roles={roles}
        callerOrgRoleId={callerOrgRoleId}
        callerOrgPermissions={callerOrgPermissions}
        onCreate={(input) => create.mutate(input)}
      />
      {editingRole && (
        <EditRoleDialog
          key={editingRole.id}
          role={editingRole}
          roles={roles}
          onSave={(input) => edit.mutate({ role: editingRole, input })}
          onDelete={() => remove.mutate(editingRole)}
          onClose={() => setEditingRole(null)}
          callerOrgRoleId={callerOrgRoleId}
          callerOrgPermissions={callerOrgPermissions}
        />
      )}
    </div>
  );
}
