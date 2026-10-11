'use client';

import React, { useState } from 'react';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createRole } from '@/lib/api/actions/roles';
import type { Permission, Role } from '@/lib/api/queries/roles';

interface CreateRoleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roles: Role[];
  callerOrgRoleId?: string | null;
  callerOrgPermissions?: string[];
}

const PERMISSION_LABELS: Record<string, string> = {
  create_role: 'Create Role',
  create_team: 'Create Team',
  add_member: 'Add Member',
  upload_document: 'Upload Document',
  assign_task: 'Assign Task',
  give_strike: 'Give Strike',
  view_aggregate: 'View Aggregates',
  review_strike: 'Review Strikes',
};

export function CreateRoleDialog({
  open,
  onOpenChange,
  roles,
  callerOrgRoleId,
  callerOrgPermissions = [],
}: CreateRoleDialogProps) {
  // Parent picker: own org role + roles with manageable: true
  const allowedParents = roles.filter(
    (r) => r.id === callerOrgRoleId || r.manageable
  );

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [parentRoleId, setParentRoleId] = useState<string>(
    allowedParents[0]?.id ?? ''
  );
  const [selectedPermissions, setSelectedPermissions] = useState<Permission[]>(
    []
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sync default parent when dialog opens
  React.useEffect(() => {
    if (open && allowedParents.length > 0 && !parentRoleId) {
      setParentRoleId(allowedParents[0].id);
    }
  }, [open, allowedParents, parentRoleId]);

  const handleTogglePermission = (perm: Permission) => {
    setSelectedPermissions((prev) =>
      prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || name.trim().length < 2) {
      toast.error('Role name must be at least 2 characters.');
      return;
    }
    if (!parentRoleId) {
      toast.error('Please select a parent role.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await createRole({
        name: name.trim(),
        description: description.trim() || undefined,
        parent_role_id: parentRoleId,
        permissions: selectedPermissions,
      });

      if (!result.ok) {
        toast.error(result.message);
        return;
      }

      toast.success(`Role "${result.data.name}" created successfully.`);
      setName('');
      setDescription('');
      setSelectedPermissions([]);
      onOpenChange(false);
    } catch {
      toast.error('An unexpected error occurred while creating the role.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Create New Role
            </DialogTitle>
            <DialogDescription>
              New roles must sit under your role or a role below yours in the hierarchy.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-1">
            {/* Role Name */}
            <div className="space-y-1.5">
              <Label htmlFor="role-name">Role Name</Label>
              <Input
                id="role-name"
                placeholder="e.g. Lead Engineer, Operations Analyst"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={50}
                required
              />
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label htmlFor="role-description">Description (Optional)</Label>
              <Input
                id="role-description"
                placeholder="Role responsibilities and scope"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            {/* Parent Role Picker */}
            <div className="space-y-1.5">
              <Label htmlFor="parent-role">Parent Role</Label>
              {allowedParents.length === 0 ? (
                <p className="text-xs text-destructive">
                  No eligible parent roles available for your permission level.
                </p>
              ) : (
                <select
                  id="parent-role"
                  value={parentRoleId}
                  onChange={(e) => setParentRoleId(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  required
                >
                  {allowedParents.map((parent) => (
                    <option key={parent.id} value={parent.id}>
                      {parent.name} (Level {parent.depth})
                      {parent.id === callerOrgRoleId ? ' — Your Role' : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Permission Checkboxes */}
            <div className="space-y-2 pt-1">
              <Label>Permissions</Label>
              <p className="text-xs text-muted-foreground">
                You can only grant permissions that your own role holds.
              </p>
              {callerOrgPermissions.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">
                  No grantable permissions available.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2 max-h-[160px] overflow-y-auto rounded-md border p-2.5">
                  {callerOrgPermissions.map((permKey) => {
                    const perm = permKey as Permission;
                    const checked = selectedPermissions.includes(perm);
                    return (
                      <label
                        key={permKey}
                        className="flex items-center gap-2 text-xs cursor-pointer select-none rounded p-1 hover:bg-muted"
                      >
                        <input
                          type="checkbox"
                          className="rounded border-input text-primary focus:ring-primary h-3.5 w-3.5"
                          checked={checked}
                          onChange={() => handleTogglePermission(perm)}
                        />
                        <span className="truncate">
                          {PERMISSION_LABELS[permKey] ?? permKey}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || allowedParents.length === 0}>
              {isSubmitting ? 'Creating...' : 'Create Role'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
