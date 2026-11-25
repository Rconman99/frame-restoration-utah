// call_logs columns that ship ahead of their migrations: from_zip
// (20261027200000) and answered (20261027220000). Production deploys run from
// the main tip, so handle-call can go live in a market before that market's
// database has these columns. PostgREST then rejects the whole write with
// PGRST204 ("Could not find the '<column>' column of 'call_logs' in the schema
// cache"), which would drop the call's status, talk time and recording.
// Retrying once without these columns keeps every existing field; the new
// columns are simply left unset until the migration is applied.
export const PENDING_CALL_LOG_COLUMNS = ["from_zip", "answered"] as const;

type WriteError = { code?: string; message?: string } | null | undefined;

export function isPendingColumnError(error: WriteError): boolean {
  if (error?.code !== "PGRST204") return false;
  const message = error.message || "";
  return PENDING_CALL_LOG_COLUMNS.some((column) =>
    message.includes(`'${column}'`)
  );
}

export function withoutPendingColumns(
  row: Record<string, unknown>,
): Record<string, unknown> {
  const rest = { ...row };
  for (const column of PENDING_CALL_LOG_COLUMNS) delete rest[column];
  return rest;
}

// Runs one call_logs write. Only when the database lacks a pending column, and
// only when the row carries one, it runs the same write once more without them.
export async function writeCallLog<E extends WriteError>(
  row: Record<string, unknown>,
  write: (row: Record<string, unknown>) => PromiseLike<{ error: E }>,
): Promise<{ error: E; retriedWithout: string[] }> {
  const first = await write(row);
  const pending = PENDING_CALL_LOG_COLUMNS.filter((column) => column in row);
  if (!pending.length || !isPendingColumnError(first.error)) {
    return { error: first.error, retriedWithout: [] };
  }
  console.warn(
    `[handle-call] call_logs lacks ${
      pending.join(", ")
    }; apply the pending migration. Saved without them.`,
  );
  const second = await write(withoutPendingColumns(row));
  return { error: second.error, retriedWithout: pending };
}
