'use client';

import React, { useMemo, useState } from 'react';
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
import { RoleNode, type RoleNodeData } from './role-node';
import { CreateRoleDialog } from './create-role-dialog';

interface RoleFlowTreeProps {
  roles: Role[];
  callerOrgRoleId?: string | null;
  callerOrgPermissions?: string[];
}

const nodeTypes: NodeTypes = {
  role: RoleNode,
};

export function RoleFlowTree({
  roles,
  callerOrgRoleId,
  callerOrgPermissions = [],
}: RoleFlowTreeProps) {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  // Can the user create roles? Gated by create_role permission or having org roles
  const canCreateRole = callerOrgPermissions.includes('create_role');

  // Compute layout (Top-Down / hierarchical)
  const { nodes, edges } = useMemo(() => {
    if (!roles || roles.length === 0) {
      return { nodes: [], edges: [] };
    }

    // Group roles by depth
    const depthGroups: Record<number, Role[]> = {};
    for (const role of roles) {
      const d = role.depth ?? 0;
      if (!depthGroups[d]) depthGroups[d] = [];
      depthGroups[d].push(role);
    }

    const NODE_WIDTH = 270;
    const HORIZONTAL_GAP = 50;
    const VERTICAL_GAP = 180;

    const computedNodes: Node<RoleNodeData>[] = [];
    const computedEdges: Edge[] = [];

    // Assign positions by depth level
    Object.entries(depthGroups).forEach(([depthStr, groupRoles]) => {
      const depth = Number(depthStr);
      const totalWidth = groupRoles.length * NODE_WIDTH + (groupRoles.length - 1) * HORIZONTAL_GAP;
      const startX = -totalWidth / 2 + NODE_WIDTH / 2;

      groupRoles.forEach((role, idx) => {
        const x = startX + idx * (NODE_WIDTH + HORIZONTAL_GAP);
        const y = depth * VERTICAL_GAP;

        computedNodes.push({
          id: role.id,
          type: 'role',
          position: { x, y },
          data: { role },
        });

        // Edge from parent
        if (role.parent_role_id) {
          computedEdges.push({
            id: `edge-${role.parent_role_id}-${role.id}`,
            source: role.parent_role_id,
            target: role.id,
            type: 'smoothstep',
            animated: false,
            style: { stroke: 'var(--border)', strokeWidth: 2 },
          });
        }
      });
    });

    return { nodes: computedNodes, edges: computedEdges };
  }, [roles]);

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
            </p>
          </div>
        </div>

        {canCreateRole && (
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

      {/* ── Create Role Dialog ─────────────────────────────────── */}
      <CreateRoleDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        roles={roles}
        callerOrgRoleId={callerOrgRoleId}
        callerOrgPermissions={callerOrgPermissions}
      />
    </div>
  );
}
