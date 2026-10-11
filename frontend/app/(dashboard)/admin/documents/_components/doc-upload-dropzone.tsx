"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, FileUp, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createDocument } from "@/lib/api/actions/documents";
import type { DocumentTagOptions } from "@/lib/api/queries/documents";
import { UploadDropzone } from "@/lib/uploadthing";
import { TagScopeSelect } from "./tag-scope-select";

interface DocUploadDropzoneProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tagOptions: DocumentTagOptions;
  /** Pick this role in step 2 (from the Roles page's "Add a document for this role"). */
  presetRoleId?: string;
}

type AllowedFileType = "pdf" | "docx" | "pptx" | "txt" | "md";

export function DocUploadDropzone({
  open,
  onOpenChange,
  tagOptions,
  presetRoleId,
}: DocUploadDropzoneProps) {
  const router = useRouter();

  // Dialog step: 1 = File Dropzone, 2 = Metadata & Tagging
  const [step, setStep] = useState<1 | 2>(1);

  // Uploaded file metadata from UploadThing
  const [fileUrl, setFileUrl] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileType, setFileType] = useState<AllowedFileType>("pdf");

  // Step 2 form fields
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [scopeType, setScopeType] = useState<"org" | "role" | "team">("org");
  const [targetId, setTargetId] = useState<string | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Who the document is for, before the user changes it: the preset role, else the
  // widest place this user may share to.
  const applyDefaultScope = () => {
    if (presetRoleId) {
      setScopeType("role");
      setTargetId(presetRoleId);
    } else if (tagOptions.org) {
      setScopeType("org");
      setTargetId(undefined);
    } else if (tagOptions.roles.length > 0) {
      setScopeType("role");
      setTargetId(tagOptions.roles[0]?.id);
    } else if (tagOptions.teams.length > 0) {
      setScopeType("team");
      setTargetId(tagOptions.teams[0]?.id);
    }
  };

  const presetRoleName = tagOptions.roles.find((r) => r.id === presetRoleId)?.name;

  const resetForm = () => {
    setStep(1);
    setFileUrl("");
    setFileName("");
    setFileType("pdf");
    setTitle("");
    setDescription("");
    applyDefaultScope();
  };

  const handleDialogChange = (isOpen: boolean) => {
    if (!isOpen) resetForm();
    onOpenChange(isOpen);
  };

  const handleScopeChange = (
    newScope: "org" | "role" | "team",
    newTargetId?: string
  ) => {
    setScopeType(newScope);
    setTargetId(newTargetId);
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

    setFileUrl(url);
    setFileName(name);
    setFileType(resolvedType);
    setTitle(name.replace(/\.[^/.]+$/, ""));

    applyDefaultScope();

    setStep(2);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || title.trim().length < 2) {
      toast.error("Document title must be at least 2 characters.");
      return;
    }
    if (scopeType === "role" && !targetId) {
      toast.error("Please select a target role.");
      return;
    }
    if (scopeType === "team" && !targetId) {
      toast.error("Please select a target team.");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await createDocument({
        title: title.trim(),
        description: description.trim() || undefined,
        scope_type: scopeType,
        role_id: scopeType === "role" ? targetId : undefined,
        team_id: scopeType === "team" ? targetId : undefined,
        file_url: fileUrl,
        file_type: fileType,
      });

      if (!result.ok) {
        toast.error(result.message);
        return;
      }

      toast.success("Document uploaded! Processing and indexing chunks...");
      handleDialogChange(false);
      router.refresh();
    } catch {
      toast.error("Failed to register the document with the server.");
    } finally {
      setIsSubmitting(false);
    }
  };

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
          <form onSubmit={handleSubmit} className="space-y-4">
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
              <div className="space-y-1.5">
                <Label htmlFor="doc-title">Document Title</Label>
                <Input
                  id="doc-title"
                  placeholder="e.g. Employee Handbook 2026"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={200}
                  required
                />
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <Label htmlFor="doc-description">Description (Optional)</Label>
                <Input
                  id="doc-description"
                  placeholder="Brief summary of document content"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              {/* Scope tagging */}
              <TagScopeSelect
                tagOptions={tagOptions}
                scopeType={scopeType}
                targetId={targetId}
                onScopeChange={handleScopeChange}
              />
            </div>

            <DialogFooter className="flex items-center justify-between sm:justify-between pt-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setStep(1)}
                disabled={isSubmitting}
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
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</>
                  ) : (
                    "Save & Index"
                  )}
                </Button>
              </div>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
