"use client";

// The list that opens above the message box (trellis/12 D43): `@` → everyone in
// the org ("name · email"), under "Your teams" then "Others in the org" (D51);
// `/` → teams you can see. The box handles the keys (↑ ↓ Enter Tab Esc); this
// only draws the list.

import { User, Users } from "lucide-react";

import { cn } from "@/lib/utils";

export interface MentionOption {
  id: string;
  kind: "user" | "team";
  label: string; // name
  detail?: string; // email, for people
  display: string; // what goes in the box: "@riya@acme.com" or "/Team Alpha"
  group?: string; // people only: "Your teams" or "Others in the org" (D51)
}

interface MentionPopoverProps {
  trigger: "@" | "/";
  options: MentionOption[];
  activeIndex: number;
  onPick: (option: MentionOption) => void;
  onHover: (index: number) => void;
}

export function MentionPopover({ trigger, options, activeIndex, onPick, onHover }: MentionPopoverProps) {
  return (
    <div className="absolute bottom-full left-0 z-20 mb-2 w-80 max-w-full overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-md">
      <p className="border-b px-3 py-1.5 text-xs text-muted-foreground">
        {trigger === "@" ? "Mention a person" : "Mention a team"}
      </p>
      {options.length === 0 ? (
        <p className="px-3 py-2 text-sm text-muted-foreground">
          {trigger === "@" ? "No people match." : "No teams match."}
        </p>
      ) : (
        <ul role="listbox" className="max-h-60 overflow-y-auto py-1">
          {options.map((option, i) => [
            option.group && option.group !== options[i - 1]?.group && (
              <li
                key={`group-${option.group}`}
                role="presentation"
                className="px-3 pt-2 pb-1 text-[0.7rem] font-semibold tracking-wide text-muted-foreground uppercase"
              >
                {option.group}
              </li>
            ),
            <li
              key={option.id}
              role="option"
              aria-selected={i === activeIndex}
              // mousedown, not click: keeps focus in the message box
              onMouseDown={(e) => {
                e.preventDefault();
                onPick(option);
              }}
              onMouseEnter={() => onHover(i)}
              className={cn(
                "flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm",
                i === activeIndex && "bg-accent text-accent-foreground"
              )}
            >
              {option.kind === "user" ? (
                <User className="size-4 shrink-0 text-blue-600 dark:text-blue-400" />
              ) : (
                <Users className="size-4 shrink-0 text-green-700 dark:text-green-400" />
              )}
              <span className="truncate font-medium">{option.label}</span>
              {option.detail && <span className="truncate text-xs text-muted-foreground">{option.detail}</span>}
            </li>,
          ])}
        </ul>
      )}
    </div>
  );
}
