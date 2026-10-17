'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { FileText, Inbox, Trash2 } from 'lucide-react';
import type { z } from 'zod';

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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import { createSubmission, deleteSubmission, loadSubmissions } from '@/lib/api/actions/tasks';
import type { Submission, Task } from '@/lib/api/queries/tasks';
import { zHandInForm } from '@/lib/api/schemas/tasks';
import { UploadDropzone } from '@/lib/uploadthing';

type HandInFormInput = z.input<typeof zHandInForm>;
type HandInFormOutput = z.output<typeof zHandInForm>;

interface UploadedFile {
  url: string;
  name: string;
  size: number;
}

function formatSize(bytes?: number | null): string {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

interface SubmissionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Only opened for tasks with can_view_submissions (trellis/12 D59). */
  task: Task;
}

/**
 * Hand-ins on a task (D59): the list you may see (all for managers, your own
 * otherwise), "Hand in work" for the person doing the task, Delete on your own.
 * Handing in never changes the task's status.
 */
export function SubmissionsDialog({ open, onOpenChange, task }: SubmissionsDialogProps) {
  const [submissions, setSubmissions] = useState<Submission[] | null>(null);
  const [uploaded, setUploaded] = useState<UploadedFile | null>(null);
  const [toDelete, setToDelete] = useState<Submission | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const form = useForm<HandInFormInput, unknown, HandInFormOutput>({
    resolver: zodResolver(zHandInForm),
    defaultValues: { notes: '' },
  });
  const isSubmitting = form.formState.isSubmitting;

  const reload = useCallback(async () => {
    const result = await loadSubmissions(task.id);
    if (result.ok) setSubmissions(result.data);
    else toast.error(result.message);
  }, [task.id]);

  // The dialog is mounted per task, so this loads once when it opens
  useEffect(() => {
    let cancelled = false;
    loadSubmissions(task.id).then((result) => {
      if (cancelled) return;
      if (result.ok) setSubmissions(result.data);
      else toast.error(result.message);
    });
    return () => {
      cancelled = true;
    };
  }, [task.id]);

  const onSubmit = form.handleSubmit(async (values) => {
    if (!uploaded) return;
    const result = await createSubmission(task.id, {
      file_url: uploaded.url,
      file_name: uploaded.name,
      file_size: uploaded.size,
      notes: values.notes,
    });
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    toast.success('Handed in.');
    setUploaded(null);
    form.reset({ notes: '' });
    await reload();
  });

  const handleDelete = async () => {
    if (!toDelete) return;
    setIsDeleting(true);
    try {
      const result = await deleteSubmission(task.id, toDelete.id);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(`${toDelete.file_name} deleted.`);
      setToDelete(null);
      await reload();
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[560px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Inbox className="h-4 w-4" />
              Hand-ins · {task.title}
            </DialogTitle>
            <DialogDescription>
              {task.can_submit
                ? 'Hand in your work on this task. Only you and your managers can see it.'
                : 'Work handed in on this task, newest first.'}
            </DialogDescription>
          </DialogHeader>

          {/* ── List ─────────────────────────────────────────────────── */}
          <div className="space-y-2">
            {submissions === null ? (
              <p className="py-4 text-center text-sm text-muted-foreground">Loading…</p>
            ) : submissions.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">Nothing handed in yet.</p>
            ) : (
              <ul className="divide-y divide-border rounded-lg border">
                {submissions.map((s) => (
                  <li key={s.id} className="flex items-start justify-between gap-3 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <a
                        href={s.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex max-w-full items-center gap-1.5 text-sm font-medium text-foreground hover:underline underline-offset-4"
                      >
                        <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate">{s.file_name}</span>
                        {s.file_size != null && (
                          <span className="shrink-0 text-xs font-normal text-muted-foreground">
                            {formatSize(s.file_size)}
                          </span>
                        )}
                      </a>
                      {s.notes && <p className="mt-0.5 text-xs text-muted-foreground">{s.notes}</p>}
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        by {s.submitted_by_name} · {formatDate(s.submitted_at)}
                      </p>
                    </div>
                    {s.can_delete && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setToDelete(s)}
                        className="shrink-0 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive gap-1"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* ── Hand in work (only the person doing the task) ──────────── */}
          {task.can_submit && (
            <form onSubmit={onSubmit} noValidate className="space-y-3 border-t pt-4">
              <h3 className="text-sm font-semibold text-foreground">Hand in work</h3>

              {uploaded ? (
                <div className="flex items-center justify-between gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">{uploaded.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{formatSize(uploaded.size)}</span>
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setUploaded(null)}
                    disabled={isSubmitting}
                    className="shrink-0 text-xs text-muted-foreground"
                  >
                    Choose another
                  </Button>
                </div>
              ) : (
                <UploadDropzone
                  endpoint="taskSubmission"
                  input={{ taskId: task.id }}
                  onClientUploadComplete={([file]) => {
                    if (!file) return;
                    setUploaded({
                      url: file.serverData?.url ?? file.ufsUrl,
                      name: file.serverData?.name ?? file.name,
                      size: file.serverData?.size ?? file.size,
                    });
                  }}
                  onUploadError={(err) => {
                    toast.error(err.message);
                  }}
                  // UploadThing's default line lists raw MIME types
                  content={{ allowedContent: 'PDF, Word, Excel, PowerPoint, PNG, JPG or TXT · up to 16 MB' }}
                  appearance={{ allowedContent: 'h-auto', button: 'mt-4' }}
                  className="ut-label:text-primary ut-button:bg-primary ut-button:text-primary-foreground border-2 border-dashed border-input hover:border-primary transition-colors"
                />
              )}

              <Controller
                name="notes"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="handin-notes">Note (optional)</FieldLabel>
                    <Textarea
                      {...field}
                      value={field.value ?? ''}
                      id="handin-notes"
                      rows={2}
                      placeholder="e.g. First draft, section 2 still in progress"
                      aria-invalid={fieldState.invalid}
                    />
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />

              <div className="flex justify-end">
                <Button type="submit" disabled={!uploaded || isSubmitting}>
                  {isSubmitting ? 'Handing in...' : 'Hand in'}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!toDelete} onOpenChange={(next) => !next && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete hand-in?</AlertDialogTitle>
            <AlertDialogDescription>
              Delete <strong className="text-foreground">{toDelete?.file_name}</strong>? The file is
              removed too. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
