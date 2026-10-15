"use client";

// The Give tab (trellis/12 D54): one form for commendations and strikes.
// - Commendation (the default): Give → "Are you sure?" → saved.
// - Strike (only with give_strike): Check policy → the policy check and the active
//   strike count appear → Confirm strike. Changing any field drops the check, because
//   the backend reuses it only for exactly the same person, team and reason.
// Pickers list only people you may commend / strike in that team (getFeedbackOptions).

import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Award, Check, Flag, Loader2, Pencil, ShieldQuestion } from "lucide-react";
import { toast } from "sonner";
import type { z } from "zod";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { checkStrike, giveCommendation, giveStrike } from "@/lib/api/actions/feedback";
import type { FeedbackOptions, FeedbackPerson, StrikePreview } from "@/lib/api/queries/feedback";
import { zGiveFeedbackForm } from "@/lib/api/schemas/feedback";
import { cn } from "@/lib/utils";
import { PolicyCheckBox } from "./policy-check-box";

type FormInput = z.input<typeof zGiveFeedbackForm>;
type FormValues = z.output<typeof zGiveFeedbackForm>;
type Kind = FormValues["kind"];

const SELECT_CLASS =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2";

interface GiveFeedbackFormProps {
  options: FeedbackOptions;
  /** give_strike somewhere: the Strike side of the switch is shown. */
  canStrike: boolean;
}

export function GiveFeedbackForm({ options, canStrike }: GiveFeedbackFormProps) {
  const peopleFor = (kind: Kind, teamId: string): FeedbackPerson[] => {
    const team = options.teams.find((t) => t.team_id === teamId);
    if (!team) return [];
    return (kind === "strike" ? team.strike_people : team.commend_people) ?? [];
  };
  const teamsFor = (kind: Kind) => options.teams.filter((t) => peopleFor(kind, t.team_id).length > 0);

  const form = useForm<FormInput, unknown, FormValues>({
    resolver: zodResolver(zGiveFeedbackForm),
    defaultValues: {
      kind: "commendation",
      team_id: teamsFor("commendation")[0]?.team_id ?? "",
      given_to_user_id: "",
      reason: "",
    },
  });
  const [kind, teamId, personId, reason] = useWatch({
    control: form.control,
    name: ["kind", "team_id", "given_to_user_id", "reason"],
  });

  const teams = teamsFor(kind);
  const people = peopleFor(kind, teamId);
  const person = people.find((p) => p.user_id === personId);
  const teamName = teams.find((t) => t.team_id === teamId)?.team_name ?? "";

  // The strike check, valid only for exactly what was checked
  const inputKey = JSON.stringify([teamId, personId, (reason ?? "").trim()]);
  const [preview, setPreview] = useState<{ key: string; data: StrikePreview } | null>(null);
  const shownPreview = kind === "strike" && preview?.key === inputKey ? preview.data : null;

  const [busy, setBusy] = useState<"checking" | "saving" | null>(null);
  const [commendToConfirm, setCommendToConfirm] = useState<FormValues | null>(null);

  const switchKind = (next: Kind) => {
    form.setValue("kind", next);
    // Keep the team and person if they still fit the new kind
    const nextTeams = teamsFor(next);
    const keepTeam = nextTeams.some((t) => t.team_id === teamId);
    const nextTeamId = keepTeam ? teamId : (nextTeams[0]?.team_id ?? "");
    form.setValue("team_id", nextTeamId);
    if (!peopleFor(next, nextTeamId).some((p) => p.user_id === personId)) {
      form.setValue("given_to_user_id", "");
    }
    form.clearErrors();
  };

  const startOver = () => {
    form.reset({ kind, team_id: teamId, given_to_user_id: "", reason: "" });
    setPreview(null);
  };

  const body = (values: FormValues) => ({
    team_id: values.team_id,
    given_to_user_id: values.given_to_user_id,
    reason: values.reason,
  });

  const handleSubmit = form.handleSubmit(async (values) => {
    if (values.kind === "commendation") {
      setCommendToConfirm(values);
      return;
    }
    if (shownPreview) {
      setBusy("saving");
      const result = await giveStrike(body(values));
      setBusy(null);
      if (!result.ok) return toast.error(result.message);
      toast.success(
        result.data.escalated
          ? `Strike saved. It's ${result.data.given_to_name}'s 3rd active strike in ${result.data.team_name}, so it's marked as escalated.`
          : `Strike saved for ${result.data.given_to_name}.`,
      );
      startOver();
      return;
    }
    setBusy("checking");
    const result = await checkStrike(body(values));
    setBusy(null);
    if (!result.ok) return toast.error(result.message);
    setPreview({ key: inputKey, data: result.data });
  });

  const saveCommendation = async () => {
    if (!commendToConfirm) return;
    setBusy("saving");
    const result = await giveCommendation(body(commendToConfirm));
    setBusy(null);
    setCommendToConfirm(null);
    if (!result.ok) return toast.error(result.message);
    toast.success(`Commendation saved for ${result.data.given_to_name}.`);
    startOver();
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="max-w-xl space-y-4">
      {canStrike && (
        <div className="inline-flex rounded-md border p-0.5" role="radiogroup" aria-label="Kind of feedback">
          {(
            [
              ["commendation", "Commendation", Award],
              ["strike", "Strike", Flag],
            ] as const
          ).map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={kind === value}
              onClick={() => switchKind(value)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-sm transition-colors",
                kind === value ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-4" />
              {label}
            </button>
          ))}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Controller
          name="team_id"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid} className="gap-1.5">
              <FieldLabel htmlFor="feedback-team">Team</FieldLabel>
              <select
                {...field}
                id="feedback-team"
                aria-invalid={fieldState.invalid}
                className={SELECT_CLASS}
                onChange={(e) => {
                  field.onChange(e);
                  form.setValue("given_to_user_id", "");
                }}
              >
                {teams.map((t) => (
                  <option key={t.team_id} value={t.team_id}>
                    {t.team_name}
                  </option>
                ))}
              </select>
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
        <Controller
          name="given_to_user_id"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid} className="gap-1.5">
              <FieldLabel htmlFor="feedback-person">Person</FieldLabel>
              <select {...field} id="feedback-person" aria-invalid={fieldState.invalid} className={SELECT_CLASS}>
                <option value="">Choose a person</option>
                {people.map((p) => (
                  <option key={p.user_id} value={p.user_id}>
                    {p.name} · {p.team_role_name} · {p.email}
                  </option>
                ))}
              </select>
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
      </div>

      <Controller
        name="reason"
        control={form.control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid} className="gap-1.5">
            <FieldLabel htmlFor="feedback-reason">Reason</FieldLabel>
            <Textarea
              {...field}
              id="feedback-reason"
              rows={3}
              maxLength={1000}
              aria-invalid={fieldState.invalid}
              placeholder={
                kind === "strike"
                  ? "Missed the sprint deadline without telling anyone"
                  : "Wrote clear handover notes before going on leave"
              }
            />
            <FieldDescription className="text-[11px]">
              {kind === "strike"
                ? "Checked against the policy documents you can see before you confirm. "
                : "The person sees this on their dashboard. "}
              {(reason ?? "").length}/1000
            </FieldDescription>
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />

      {shownPreview ? (
        <div className="space-y-3 rounded-xl border bg-card p-4">
          <p className="text-sm font-medium">
            Strike for {shownPreview.given_to_name} in {shownPreview.team_name}
          </p>
          <PolicyCheckBox policy={shownPreview.policy} />
          <p className={cn("text-sm", shownPreview.will_escalate ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground")}>
            Active strikes in this team: {shownPreview.active_strikes} so far.
            {shownPreview.will_escalate &&
              ` This one makes ${shownPreview.active_strikes + 1}, so it will be marked as escalated.`}
          </p>
          <p className="text-xs text-muted-foreground">Nothing is saved until you confirm.</p>
          <div className="flex gap-2">
            <Button type="submit" disabled={busy !== null}>
              {busy === "saving" ? <Loader2 className="animate-spin" /> : <Check />}
              Confirm strike
            </Button>
            <Button type="button" variant="outline" disabled={busy !== null} onClick={() => setPreview(null)}>
              <Pencil />
              Edit
            </Button>
          </div>
        </div>
      ) : (
        <Button type="submit" disabled={busy !== null || teams.length === 0}>
          {busy ? (
            <Loader2 className="animate-spin" />
          ) : kind === "strike" ? (
            <ShieldQuestion />
          ) : (
            <Award />
          )}
          {kind === "strike" ? (busy === "checking" ? "Checking policy…" : "Check policy") : "Give commendation"}
        </Button>
      )}

      <AlertDialog open={commendToConfirm !== null} onOpenChange={(open) => !open && setCommendToConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Commend {person?.name ?? "this person"} in {teamName}?
            </AlertDialogTitle>
            <AlertDialogDescription className="whitespace-pre-wrap">
              {commendToConfirm?.reason}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy !== null}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy !== null}
              onClick={(e) => {
                e.preventDefault(); // close only after the save answers
                void saveCommendation();
              }}
            >
              {busy === "saving" && <Loader2 className="animate-spin" />}
              Give commendation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}
