'use client';

import React, { memo } from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { Shield, ShieldAlert, Layers, Pencil } from 'lucide-react';
import type { Permission, Role } from '@/lib/api/queries/roles';
import { PERMISSION_LABELS } from './role-form-fields';

export type RoleNodeData = {
  role: Role;
  [key: string]: unknown;
};

export type RoleNodeType = Node<RoleNodeData, 'role'>;

export const RoleNode = memo(function RoleNode({
  data,
}: NodeProps<RoleNodeType>) {
  const role = data.role;

  return (
    <div
      className={`relative min-w-[240px] max-w-[280px] rounded-xl border bg-card p-3.5 shadow-sm transition-all hover:shadow-md ${
        role.manageable ? 'cursor-pointer hover:border-primary' : ''
      }`}
    >
      {/* Target handle at Top */}
      <Handle
        type="target"
        position={Position.Top}
        className="!h-2.5 !w-2.5 !border-2 !border-background !bg-primary"
      />

      {/* Role Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {role.is_system ? (
            <ShieldAlert className="h-4 w-4 shrink-0 text-amber-500" />
          ) : (
            <Shield className="h-4 w-4 shrink-0 text-primary" />
          )}
          <span className="font-semibold text-sm truncate text-foreground">
            {role.name}
          </span>
        </div>
        {role.is_system && (
          <span className="shrink-0 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
            System
          </span>
        )}
        {/* Roles below the viewer can be clicked to edit */}
        {role.manageable && (
          <Pencil className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="Editable" />
        )}
      </div>

      {/* Depth Badge */}
      <div className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
        <Layers className="h-3 w-3" />
        <span>Level {role.depth}</span>
      </div>

      {/* Description */}
      {role.description && (
        <p className="mt-1.5 text-xs text-muted-foreground line-clamp-2">
          {role.description}
        </p>
      )}

      {/* Permissions */}
      {role.permissions && role.permissions.length > 0 && (
        <div className="mt-2.5 pt-2 border-t flex flex-wrap gap-1">
          {role.permissions.map((perm) => (
            <span
              key={perm}
              className="rounded-md bg-secondary px-1.5 py-0.5 text-[10px] text-secondary-foreground"
            >
              {PERMISSION_LABELS[perm as Permission] ?? perm}
            </span>
          ))}
        </div>
      )}

      {/* Source handle at Bottom */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-2.5 !w-2.5 !border-2 !border-background !bg-primary"
      />
    </div>
  );
});
