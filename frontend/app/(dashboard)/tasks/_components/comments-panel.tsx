'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { MessageSquare, Pencil, Send, Trash2 } from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import type { Task } from '@/lib/api/queries/tasks';
import { zCommentForm } from '@/lib/api/schemas/tasks';
import { useCommentChanges, useTaskComments, type CommentRow } from './use-comment-changes';

// The backend stores naive UTC (no "Z"); read it as UTC so the time is right locally.
function asUtc(iso: string): Date {
  return new Date(/[zZ]|[+-]\d\d:\d\d$/.test(iso) ? iso : `${iso}Z`);
}

function formatTime(iso: string): string {
  return asUtc(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Plain text (D60): keep line breaks, make links clickable. React escapes the rest.
function CommentText({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return (
    <p className="whitespace-pre-wrap break-words text-sm text-foreground">
      {parts.map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline underline-offset-2"
          >
            {part}
          </a>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        ),
      )}
    </p>
  );
}

/** Checks a draft with the backend's rule (trimmed, 1–2000 characters). */
function checkDraft(draft: string): { content?: string; error?: string } {
  const parsed = zCommentForm.safeParse({ content: draft });
  return parsed.success
    ? { content: parsed.data.content }
    : { error: parsed.error.issues[0]?.message ?? 'Please check the comment.' };
}

interface CommentsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Anyone who can see the task reads and posts (trellis/12 D60). */
  task: Task;
}

/**
 * A task's comments in a side panel (D60): oldest at the top, write box at the
 * bottom. Posting, editing and deleting your own show at once (D50).
 */
export function CommentsPanel({ open, onOpenChange, task }: CommentsPanelProps) {
  const { user } = useUser();
  const { data: comments, isLoading, isError } = useTaskComments(task.id);
  const { add, edit, remove } = useCommentChanges(task.id, user?.fullName ?? 'You');

  const [draft, setDraft] = useState('');
  const [draftError, setDraftError] = useState<string | undefined>();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [editError, setEditError] = useState<string | undefined>();
  const [toDelete, setToDelete] = useState<CommentRow | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  // Keep the newest comment in view when the list grows (and when it first loads)
  const count = comments?.length ?? 0;
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [count]);

  const send = () => {
    const { content, error } = checkDraft(draft);
    setDraftError(error);
    if (!content) return;
    add.mutate(content);
    setDraft('');
  };

  const startEdit = (comment: CommentRow) => {
    setEditingId(comment.id);
    setEditDraft(comment.content);
    setEditError(undefined);
  };

  const saveEdit = (comment: CommentRow) => {
    const { content, error } = checkDraft(editDraft);
    setEditError(error);
    if (!content) return;
    if (content !== comment.content) edit.mutate({ comment, content });
    setEditingId(null);
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
          <SheetHeader className="border-b p-4">
            <SheetTitle className="flex items-center gap-2 pr-6">
              <MessageSquare className="h-4 w-4 shrink-0" />
              <span className="truncate">Comments · {task.title}</span>
            </SheetTitle>
            <SheetDescription>Everyone who can see this task can read and reply.</SheetDescription>
          </SheetHeader>

          {/* ── Conversation ────────────────────────────────────────────── */}
          <div className="flex-1 overflow-y-auto px-4 py-3">
            {isLoading ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
            ) : isError ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Couldn&apos;t load the comments. Close and try again.
              </p>
            ) : count === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No comments yet. Start the conversation.
              </p>
            ) : (
              <ul className="space-y-4">
                {comments!.map((c) => (
                  <li key={c.id} className={c.pending ? 'opacity-60' : ''}>
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-xs">
                        <span className="font-semibold text-foreground">{c.author_name}</span>
                        <span className="text-muted-foreground">
                          {' · '}
                          {c.pending ? 'Sending…' : formatTime(c.created_at)}
                          {c.edited_at && ' (edited)'}
                        </span>
                      </p>
                      {(c.can_edit || c.can_delete) && editingId !== c.id && (
                        <div className="flex shrink-0 items-center gap-0.5">
                          {c.can_edit && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => startEdit(c)}
                              className="h-6 px-1.5 text-xs text-muted-foreground"
                              aria-label="Edit comment"
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                          )}
                          {c.can_delete && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setToDelete(c)}
                              className="h-6 px-1.5 text-xs text-muted-foreground hover:text-destructive"
                              aria-label="Delete comment"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      )}
                    </div>

                    {editingId === c.id ? (
                      <div className="mt-1 space-y-1.5">
                        <Textarea
                          value={editDraft}
                          onChange={(e) => setEditDraft(e.target.value)}
                          rows={3}
                          aria-label="Edit comment"
                          aria-invalid={!!editError}
                        />
                        {editError && <p className="text-xs text-destructive">{editError}</p>}
                        <div className="flex justify-end gap-1.5">
                          <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                            Cancel
                          </Button>
                          <Button size="sm" onClick={() => saveEdit(c)}>
                            Save
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-0.5">
                        <CommentText text={c.content} />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <div ref={bottomRef} />
          </div>

          {/* ── Write box (Enter sends, Shift+Enter = new line) ──────────── */}
          <div className="border-t p-3">
            <div className="flex items-end gap-2">
              <Textarea
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  if (draftError) setDraftError(undefined);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                rows={2}
                placeholder="Write a comment…"
                aria-label="Write a comment"
                aria-invalid={!!draftError}
                className="min-h-[60px] flex-1 resize-none"
              />
              <Button onClick={send} size="sm" className="gap-1.5" aria-label="Send comment">
                <Send className="h-3.5 w-3.5" />
                Send
              </Button>
            </div>
            {draftError && <p className="mt-1 text-xs text-destructive">{draftError}</p>}
          </div>
        </SheetContent>
      </Sheet>

      {/* Delete confirmation */}
      <AlertDialog open={!!toDelete} onOpenChange={(next) => !next && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this comment?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (toDelete) remove.mutate(toDelete);
                setToDelete(null);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
