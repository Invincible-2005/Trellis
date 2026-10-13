// Shared by every area file (trellis/12 D49): friendly error wording, a one-line
// helper for toasts, and small form helpers. Each area file imports this, so the
// wording applies wherever a schema is used: in a dialog or a Server Action.
import { z } from 'zod';

z.config({
  customError: (issue) => {
    switch (issue.code) {
      case 'too_small':
        if (issue.origin === 'string') {
          return issue.minimum === 1
            ? 'This field is required.'
            : `Must be at least ${issue.minimum} characters.`;
        }
        if (issue.origin === 'array') return `Pick at least ${issue.minimum}.`;
        return undefined;
      case 'too_big':
        if (issue.origin === 'string') return `Must be at most ${issue.maximum} characters.`;
        return undefined;
      case 'invalid_format':
        // An empty <select> sends "", which fails the uuid check.
        if (issue.format === 'uuid') return 'Please choose an option.';
        if (issue.format === 'regex' && issue.pattern?.includes('@')) return 'Enter a valid email address.';
        return "This doesn't look right. Check the format.";
      case 'invalid_value':
      case 'invalid_union':
        return 'Please choose one of the options.';
      default:
        return undefined; // zod's own message
    }
  },
});

/**
 * The first problem as one line for a toast, e.g. "name: Must be at least 2 characters."
 * Server Actions return it as { ok: false, message }.
 */
export function firstError(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return 'Please check the form and try again.';
  return issue.path.length ? `${issue.path.join('.')}: ${issue.message}` : issue.message;
}

/**
 * For a <select> whose "None" option has value "": "" becomes null, anything else
 * gets the backend's own check. Use it on a generated field, e.g.
 * `emptyAsNull(zAddMemberRequest.shape.role_id)`.
 */
export function emptyAsNull<T extends z.ZodType>(schema: T) {
  return z.union([z.literal('').transform(() => null), schema]);
}
