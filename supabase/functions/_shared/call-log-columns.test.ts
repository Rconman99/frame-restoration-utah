import { assertEquals } from "jsr:@std/assert@1";
import {
  isPendingColumnError,
  withoutPendingColumns,
  writeCallLog,
} from "./call-log-columns.ts";

const missing = (column: string) => ({
  code: "PGRST204",
  message:
    `Could not find the '${column}' column of 'call_logs' in the schema cache`,
});

Deno.test("only a missing pending column counts as a pending-column error", () => {
  assertEquals(isPendingColumnError(missing("from_zip")), true);
  assertEquals(isPendingColumnError(missing("answered")), true);
  assertEquals(isPendingColumnError(missing("recording_url")), false);
  assertEquals(
    isPendingColumnError({ code: "XX000", message: "'answered'" }),
    false,
  );
  assertEquals(isPendingColumnError(null), false);
  assertEquals(isPendingColumnError(undefined), false);
});

Deno.test("withoutPendingColumns keeps every other field", () => {
  assertEquals(
    withoutPendingColumns({
      status: "completed",
      duration_seconds: 42,
      recording_url: "https://recordings.test/a",
      answered: true,
      from_zip: "84601",
    }),
    {
      status: "completed",
      duration_seconds: 42,
      recording_url: "https://recordings.test/a",
    },
  );
});

Deno.test("writeCallLog retries once without pending columns, only when the database lacks one", async () => {
  const seen: Record<string, unknown>[] = [];
  const result = await writeCallLog(
    { status: "completed", answered: true },
    (row) => {
      seen.push(row);
      return Promise.resolve({
        error: "answered" in row ? missing("answered") : null,
      });
    },
  );
  assertEquals(seen, [{ status: "completed", answered: true }, {
    status: "completed",
  }]);
  assertEquals(result, { error: null, retriedWithout: ["answered"] });
});

Deno.test("writeCallLog does not retry other failures or rows without pending columns", async () => {
  let calls = 0;
  const other = await writeCallLog(
    { status: "completed", answered: true },
    () => {
      calls += 1;
      return Promise.resolve({ error: { code: "XX000", message: "down" } });
    },
  );
  assertEquals(calls, 1);
  assertEquals(other.retriedWithout, []);
  assertEquals(other.error?.code, "XX000");

  calls = 0;
  const plain = await writeCallLog({ status: "completed" }, () => {
    calls += 1;
    return Promise.resolve({ error: missing("answered") });
  });
  assertEquals(calls, 1);
  assertEquals(plain.retriedWithout, []);
});

Deno.test("writeCallLog reports the retry's own error", async () => {
  const result = await writeCallLog({ from_zip: "84601", status: "ringing" }, (
    row,
  ) =>
    Promise.resolve({
      error: "from_zip" in row
        ? missing("from_zip")
        : { code: "XX000", message: "down" },
    }));
  assertEquals(result.error?.code, "XX000");
  assertEquals(result.retriedWithout, ["from_zip"]);
});
