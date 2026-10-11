'use client';

import React from 'react';
import { Building2, Shield, Users } from 'lucide-react';
import { Label } from '@/components/ui/label';
import type { DocumentTagOptions } from '@/lib/api/queries/documents';

interface TagScopeSelectProps {
  tagOptions: DocumentTagOptions;
  scopeType: 'org' | 'role' | 'team';
  targetId?: string;
  onScopeChange: (scope: 'org' | 'role' | 'team', targetId?: string) => void;
}

export function TagScopeSelect({
  tagOptions,
  scopeType,
  targetId,
  onScopeChange,
}: TagScopeSelectProps) {
  const hasOrg = tagOptions.org;
  const hasRoles = tagOptions.roles && tagOptions.roles.length > 0;
  const hasTeams = tagOptions.teams && tagOptions.teams.length > 0;

  const handleScopeTypeClick = (type: 'org' | 'role' | 'team') => {
    if (type === 'org') {
      onScopeChange('org', undefined);
    } else if (type === 'role') {
      const defaultRole = tagOptions.roles[0]?.id;
      onScopeChange('role', defaultRole);
    } else if (type === 'team') {
      const defaultTeam = tagOptions.teams[0]?.id;
      onScopeChange('team', defaultTeam);
    }
  };

  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium">Visibility & Scope</Label>

      {/* Scope selector buttons */}
      <div className="grid grid-cols-3 gap-2">
        {/* Whole Org Option */}
        <button
          type="button"
          disabled={!hasOrg}
          onClick={() => handleScopeTypeClick('org')}
          className={`flex flex-col items-center justify-center gap-1.5 rounded-lg border p-3 text-center transition-all ${
            scopeType === 'org'
              ? 'border-primary bg-primary/5 text-primary ring-1 ring-primary'
              : 'border-input bg-card text-foreground hover:bg-muted/50'
          } ${!hasOrg ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
        >
          <Building2 className="h-4 w-4" />
          <span className="text-xs font-medium">Whole Org</span>
        </button>

        {/* Role Option */}
        <button
          type="button"
          disabled={!hasRoles}
          onClick={() => handleScopeTypeClick('role')}
          className={`flex flex-col items-center justify-center gap-1.5 rounded-lg border p-3 text-center transition-all ${
            scopeType === 'role'
              ? 'border-primary bg-primary/5 text-primary ring-1 ring-primary'
              : 'border-input bg-card text-foreground hover:bg-muted/50'
          } ${!hasRoles ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
        >
          <Shield className="h-4 w-4" />
          <span className="text-xs font-medium">By Role</span>
        </button>

        {/* Team Option */}
        <button
          type="button"
          disabled={!hasTeams}
          onClick={() => handleScopeTypeClick('team')}
          className={`flex flex-col items-center justify-center gap-1.5 rounded-lg border p-3 text-center transition-all ${
            scopeType === 'team'
              ? 'border-primary bg-primary/5 text-primary ring-1 ring-primary'
              : 'border-input bg-card text-foreground hover:bg-muted/50'
          } ${!hasTeams ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
        >
          <Users className="h-4 w-4" />
          <span className="text-xs font-medium">By Team</span>
        </button>
      </div>

      {/* Scope helper text */}
      <p className="text-xs text-muted-foreground">
        {scopeType === 'org' &&
          'Visible to every member of the organization.'}
        {scopeType === 'role' &&
          'Visible to the selected role and all senior roles hierarchically above it.'}
        {scopeType === 'team' &&
          'Visible only to members of this specific team.'}
      </p>

      {/* Sub-picker: Specific Role */}
      {scopeType === 'role' && hasRoles && (
        <div className="space-y-1.5 pt-1">
          <Label htmlFor="role-select" className="text-xs text-muted-foreground">
            Target Role
          </Label>
          <select
            id="role-select"
            value={targetId ?? ''}
            onChange={(e) => onScopeChange('role', e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            required
          >
            {tagOptions.roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Sub-picker: Specific Team */}
      {scopeType === 'team' && hasTeams && (
        <div className="space-y-1.5 pt-1">
          <Label htmlFor="team-select" className="text-xs text-muted-foreground">
            Target Team
          </Label>
          <select
            id="team-select"
            value={targetId ?? ''}
            onChange={(e) => onScopeChange('team', e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            required
          >
            {tagOptions.teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
