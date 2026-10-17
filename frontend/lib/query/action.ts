/** What every Server Action in `lib/api/actions/` returns (trellis/12 D18). */
type ActionResult<T> = { ok: true; data: T } | { ok: false; message: string };

/**
 * Runs a Server Action inside `useMutation` (trellis/12 D50). Our actions return
 * `{ ok: false, message }` instead of throwing, so this throws it: `onError` then
 * rolls the instant change back and can show `error.message` as the toast.
 *
 * Usage:
 *   mutationFn: (userId: string) => fromAction(removeMember(userId)),
 */
export async function fromAction<T>(action: Promise<ActionResult<T>>): Promise<T> {
  let result: ActionResult<T>;
  try {
    result = await action;
  } catch {
    // The request never got an answer (offline, server down).
    throw new Error("Couldn't reach the server, so nothing was changed. Please try again.");
  }
  if (!result.ok) throw new Error(result.message);
  return result.data;
}
