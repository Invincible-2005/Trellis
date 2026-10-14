"use client";

import React, { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { toast } from "sonner";
import { ArrowLeft, FileUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { DocumentTagOptions } from "@/lib/api/queries/documents";
import { zUploadDocumentForm } from "@/lib/api/schemas/documents";
import { UploadDropzone } from "@/lib/uploadthing";
import { TagScopeSelect } from "./tag-scope-select";
import { useDocumentChanges } from "./use-document-changes";

interface DocUploadDropzoneProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tagOptions: DocumentTagOptions;
  /** Pick this role in step 2 (from the Roles page's "Add a document for this role"). */
  presetRoleId?: string;
}

type AllowedFileType = "pdf" | "docx" | "pptx" | "txt" | "md";

/** Step 2 values: the backend's CreateDocumentRequest, before and after zod checks it. */
type UploadFormValues = z.input<typeof zUploadDocumentForm>;
type UploadFormOutput = z.output<typeof zUploadDocumentForm>;

export function DocUploadDropzone({
  open,
  onOpenChange,
  tagOptions,
  presetRoleId,
}: DocUploadDropzoneProps) {

  // Dialog step: 1 = File Dropzone, 2 = Metadata & Tagging
  const [step, setStep] = useState<1 | 2>(1);

  // Uploaded file name, for the step 2 heading
  const [fileName, setFileName] = useState("");

  // Who the document is for, before the user changes it: the preset role, else the
  // widest place this user may share to.
  const defaultScope = (): Pick<UploadFormValues, "scope_type" | "role_id" | "team_id"> => {
    if (presetRoleId) return { scope_type: "role", role_id: presetRoleId };
    if (tagOptions.org) return { scope_type: "org" };
    if (tagOptions.roles.length > 0) return { scope_type: "role", role_id: tagOptions.roles[0]?.id };
    if (tagOptions.teams.length > 0) return { scope_type: "team", team_id: tagOptions.teams[0]?.id };
    return { scope_type: "org" };
  };

  const emptyForm = (file?: { url: string; name: string; type: AllowedFileType }): UploadFormValues => ({
    title: file ? file.name.replace(/\.[^/.]+$/, "") : "",
    description: "",
    file_url: file?.url ?? "",
    file_type: file?.type ?? "pdf",
    ...defaultScope(),
  });

  // Checks come from the backend's own rules (generated zod schema, trellis/12 D49).
  const form = useForm<UploadFormValues, unknown, UploadFormOutput>({
    resolver: zodResolver(zUploadDocumentForm),
    defaultValues: emptyForm(),
  });
  const { create } = useDocumentChanges();
  const [scopeType, roleId, teamId] = useWatch({
    control: form.control,
    name: ["scope_type", "role_id", "team_id"],
  });
  const targetId = (scopeType === "role" ? roleId : scopeType === "team" ? teamId : undefined) ?? undefined;
  const targetError = form.formState.errors.role_id ?? form.formState.errors.team_id;

  const presetRoleName = tagOptions.roles.find((r) => r.id === presetRoleId)?.name;

  const resetForm = () => {
    setStep(1);
    setFileName("");
    form.reset(emptyForm());
  };

  const handleDialogChange = (isOpen: boolean) => {
    if (!isOpen) resetForm();
    onOpenChange(isOpen);
  };

  const handleScopeChange = (
    newScope: "org" | "role" | "team",
    newTargetId?: string
  ) => {
    form.setValue("scope_type", newScope);
    form.setValue("role_id", newScope === "role" ? newTargetId : undefined);
    form.setValue("team_id", newScope === "team" ? newTargetId : undefined);
    form.clearErrors(["role_id", "team_id"]);
  };

  const handleUploadComplete = (
    res: Array<{ name: string; url?: string; serverData?: { url: string; name: string } }>
  ) => {
    const file = res[0];
    if (!file) return;

    const url = file.serverData?.url ?? file.url ?? "";
    const name = file.serverData?.name ?? file.name ?? "document";

    const ext = name.split(".").pop()?.toLowerCase();
    const allowed: AllowedFileType[] = ["pdf", "docx", "pptx", "txt", "md"];
    const resolvedType: AllowedFileType = allowed.includes(ext as AllowedFileType)
      ? (ext as AllowedFileType)
      : "pdf";

    setFileName(name);
    form.reset(emptyForm({ url, name, type: resolvedType }));

    setStep(2);
  };

  // `values` is already checked (title trimmed, a role or team picked for that audience).
  // The file is already in UploadThing; registering it is instant: the dialog closes and a
  // greyed "Saving…" row appears until the server answers (use-document-changes.ts).
  const handleSubmit = form.handleSubmit((values) => {
    create.mutate({
      ...values,
      description: values.description?.trim() || undefined,
      role_id: values.scope_type === "role" ? values.role_id : undefined,
      team_id: values.scope_type === "team" ? values.team_id : undefined,
    });
    handleDialogChange(false);
  });

  return (
    <Dialog open={open} onOpenChange={handleDialogChange}>
      <DialogContent className="sm:max-w-[520px]">
        {step === 1 ? (
          <div>
            <DialogHeader className="mb-4">
              <DialogTitle className="flex items-center gap-2">
                <FileUp className="h-5 w-5 text-primary" />
                {presetRoleName ? `Upload a document for ${presetRoleName}` : "Upload & share a document"}
              </DialogTitle>
              <DialogDescription>
                Step 1 of 2: choose the file (PDF, DOCX, PPTX, TXT, or MD, max 16 MB). Next you
                choose who should see it.
              </DialogDescription>
            </DialogHeader>
            <div className="py-2">
              <UploadDropzone
                endpoint="policyDocument"
                onClientUploadComplete={handleUploadComplete}
                onUploadError={(err) => {
                  toast.error(`Upload error: ${err.message}`);
                }}
                // UploadThing's default line lists raw MIME types and runs under the button
                content={{ allowedContent: "PDF, DOCX, PPTX, TXT or MD · up to 16 MB" }}
                appearance={{ allowedContent: "h-auto", button: "mt-4" }}
                className="ut-label:text-primary ut-button:bg-primary ut-button:text-primary-foreground border-2 border-dashed border-input hover:border-primary transition-colors"
              />
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileUp className="h-5 w-5 text-primary" />
                Step 2 of 2: name it and choose who sees it
              </DialogTitle>
              <DialogDescription>
                Uploaded file:{" "}
                <span className="font-medium text-foreground">{fileName}</span>
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3.5 py-1">
              {/* Title */}
              <Controller
                name="title"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid} className="gap-1.5">
                    <FieldLabel htmlFor="doc-title">Document Title</FieldLabel>
                    <Input
                      {...field}
                      id="doc-title"
                      placeholder="e.g. Employee Handbook 2026"
                      maxLength={200}
                      aria-invalid={fieldState.invalid}
                    />
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />

              {/* Description */}
              <Controller
                name="description"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid} className="gap-1.5">
                    <FieldLabel htmlFor="doc-description">Description (Optional)</FieldLabel>
                    <Input
                      {...field}
                      value={field.value ?? ""}
                      id="doc-description"
                      placeholder="Brief summary of document content"
                      aria-invalid={fieldState.invalid}
                    />
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />

              {/* Scope tagging */}
              <div className="space-y-1.5">
                <TagScopeSelect
                  tagOptions={tagOptions}
                  scopeType={scopeType}
                  targetId={targetId}
                  onScopeChange={handleScopeChange}
                />
                <FieldError errors={[targetError]} />
              </div>
            </div>

            <DialogFooter className="flex items-center justify-between sm:justify-between pt-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setStep(1)}
                className="flex items-center gap-1.5"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleDialogChange(false)}
                >
                  Cancel
                </Button>
                <Button type="submit">Save &amp; Index</Button>
              </div>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
