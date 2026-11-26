// Where the lead form's city and ZIP go on a `leads` row.
//
// The form has always collected both, but handle-lead only folded them into
// the free-text `address`, so the weekly city rollup could not place a web
// lead in a city. `leads.city` already exists; `zip` and `city_source` ship in
// migration 20261122230000 and may reach a market after this code does.
//
// `leads.city` also sets the commission rate (GENERATED column: 5% for
// Heber / Heber City / Midway, 10% elsewhere). Writing it at intake means the
// rate follows what the homeowner typed until the owner corrects it in the
// CRM. The value is stored as typed: no ZIP lookup and no spelling repair, so
// nothing here guesses a city the customer did not give.
export const PENDING_LEAD_COLUMNS = ["zip", "city_source"] as const;

// Same value Texas uses for a city the customer entered on the form. The
// rollup treats any source other than `caller_locality` as a stated city.
export const FORM_CITY_SOURCE = "form";

const ZIP_PATTERN = /^\d{5}(?:-\d{4})?$/u;

export function leadLocationColumns(
  city: string,
  zip: string,
): { city: string | null; zip: string | null; city_source: string | null } {
  const typedCity = city.trim();
  const typedZip = zip.trim();
  return {
    city: typedCity || null,
    // Anything that is not a US ZIP is dropped rather than stored as one.
    zip: ZIP_PATTERN.test(typedZip) ? typedZip : null,
    city_source: typedCity ? FORM_CITY_SOURCE : null,
  };
}

type WriteError = { code?: string; message?: string } | null | undefined;

export function isPendingLeadColumnError(error: WriteError): boolean {
  if (error?.code !== "PGRST204") return false;
  const message = error.message || "";
  return PENDING_LEAD_COLUMNS.some((column) => message.includes(`'${column}'`));
}

export function withoutPendingLeadColumns(
  row: Record<string, unknown>,
): Record<string, unknown> {
  const rest = { ...row };
  for (const column of PENDING_LEAD_COLUMNS) delete rest[column];
  return rest;
}

// Runs the lead insert. PostgREST rejects the whole row with PGRST204 when the
// database lacks a column, which would lose the lead. Only in that case, and
// only for the pending columns, the same insert runs once more without them:
// the lead is saved exactly as it was before this change, and `city` (which
// already exists) is still written.
export async function insertLeadRow<R extends { error: WriteError }>(
  row: Record<string, unknown>,
  insert: (row: Record<string, unknown>) => PromiseLike<R>,
): Promise<R & { retriedWithout: string[] }> {
  const first = await insert(row);
  const pending = PENDING_LEAD_COLUMNS.filter((column) => column in row);
  if (!pending.length || !isPendingLeadColumnError(first.error)) {
    return { ...first, retriedWithout: [] };
  }
  console.warn(
    `[handle-lead] leads lacks ${
      pending.join(", ")
    }; apply migration 20261122230000. Saved without them.`,
  );
  const second = await insert(withoutPendingLeadColumns(row));
  return { ...second, retriedWithout: [...pending] };
}
