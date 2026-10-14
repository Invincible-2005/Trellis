"use client";

// Your chats, beside the conversation (trellis/12 D41). A plain panel, not a
// shadcn Sidebar: two sidebars would share the app sidebar's open/closed cookie.
// Desktop: a panel you can hide; the hide/show button stays fixed at its top-left.
// Phones: a drawer opened from the top-left button.
// Top to bottom: [button] Your Chats · separator · + New Chat · separator · your chats.

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageSquare, MoreHorizontal, PanelLeftClose, PanelLeftOpen, Pencil, Plus, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ChatSummary } from "@/lib/api/queries/chat";
import { useServerData } from "@/lib/query/use-server-data";
import { RenameChatDialog } from "./rename-chat-dialog";
import { DeleteChatDialog } from "./delete-chat-dialog";
import { CHATS_KEY, useChatChanges, type ChatRow } from "./use-chat-changes";

interface ChatSessionListProps {
  chats: ChatSummary[];
}

export function ChatSessionList(props: ChatSessionListProps) {
  // The server's list, kept in TanStack so changes show instantly (use-chat-changes.ts).
  const chats = useServerData<ChatRow[]>(CHATS_KEY, props.chats);
  const { rename, remove } = useChatChanges();
  const [open, setOpen] = useState(true); // desktop panel
  const [drawerOpen, setDrawerOpen] = useState(false); // phones
  const [renaming, setRenaming] = useState<ChatSummary | null>(null);
  const [deleting, setDeleting] = useState<ChatSummary | null>(null);

  const list = (
    <ChatList
      chats={chats}
      onNavigate={() => setDrawerOpen(false)}
      onRename={setRenaming}
      onDelete={setDeleting}
    />
  );

  return (
    <>
      {/* Desktop: the panel, or a slim rail. The toggle sits in the same top-left spot in both. */}
      {open ? (
        <aside className="hidden w-64 shrink-0 flex-col border-r bg-muted/30 md:flex">
          <div className="flex h-12 shrink-0 items-center gap-2 px-2">
            <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Hide chat list">
              <PanelLeftClose />
            </Button>
            <span className="text-sm font-semibold">Your Chats</span>
          </div>
          <Separator />
          <div className="p-2">
            <NewChatButton />
          </div>
          <Separator />
          {list}
        </aside>
      ) : (
        <div className="hidden shrink-0 flex-col border-r bg-muted/30 md:flex">
          <div className="flex h-12 shrink-0 items-center px-2">
            <Button variant="ghost" size="icon" onClick={() => setOpen(true)} aria-label="Show chat list">
              <PanelLeftOpen />
            </Button>
          </div>
          <Separator />
          <div className="p-2">
            <Button variant="ghost" size="icon" asChild aria-label="New Chat">
              <Link href="/chat">
                <Plus />
              </Link>
            </Button>
          </div>
        </div>
      )}

      {/* Phones: a drawer */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            className="absolute top-3 left-3 z-10 md:hidden"
            aria-label="Your Chats"
          >
            <MessageSquare />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-72 gap-0 p-0">
          <SheetHeader>
            <SheetTitle>Your Chats</SheetTitle>
          </SheetHeader>
          <Separator />
          <div className="p-2" onClick={() => setDrawerOpen(false)}>
            <NewChatButton />
          </div>
          <Separator />
          {list}
        </SheetContent>
      </Sheet>

      {renaming && (
        <RenameChatDialog
          chat={renaming}
          onRename={(title) => rename.mutate({ chat: renaming, title })}
          onClose={() => setRenaming(null)}
        />
      )}
      {deleting && (
        <DeleteChatDialog
          chat={deleting}
          onDelete={() => remove.mutate(deleting)}
          onClose={() => setDeleting(null)}
        />
      )}
    </>
  );
}

function NewChatButton() {
  return (
    <Button variant="outline" className="w-full justify-start" asChild>
      <Link href="/chat">
        <Plus />
        New Chat
      </Link>
    </Button>
  );
}

interface ChatListProps {
  chats: ChatRow[];
  onNavigate: () => void;
  onRename: (chat: ChatSummary) => void;
  onDelete: (chat: ChatSummary) => void;
}

function ChatList({ chats, onNavigate, onRename, onDelete }: ChatListProps) {
  const pathname = usePathname();

  if (chats.length === 0) {
    return <p className="px-4 py-3 text-sm text-muted-foreground">No chats yet. Ask your first question.</p>;
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <ul className="flex flex-col gap-0.5 p-2">
        {chats.map((chat) => {
          const active = pathname === `/chat/${chat.id}`;
          // Still being saved: no link or menu until the server gives it a real id
          if (chat.pending) {
            return (
              <li key={chat.id} className="truncate rounded-md py-2 pr-9 pl-3 text-sm opacity-60">
                New chat
              </li>
            );
          }
          return (
            <li key={chat.id} className="group relative">
              <Link
                href={`/chat/${chat.id}`}
                onClick={onNavigate}
                className={cn(
                  "block truncate rounded-md py-2 pr-9 pl-3 text-sm hover:bg-muted",
                  active && "bg-muted font-medium"
                )}
                title={chat.title ?? "New chat"}
              >
                {chat.title ?? "New chat"}
              </Link>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="absolute top-1/2 right-1.5 -translate-y-1/2 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:aria-expanded:opacity-100"
                    aria-label={`Options for ${chat.title ?? "this chat"}`}
                  >
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => onRename(chat)}>
                    <Pencil />
                    Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem variant="destructive" onSelect={() => onDelete(chat)}>
                    <Trash2 />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
