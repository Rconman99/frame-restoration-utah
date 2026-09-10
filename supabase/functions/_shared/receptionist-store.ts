import {
  advance,
  escapeXml,
  initialState,
  renderGather,
  type ScreeningState,
  SCRIPT_VERSION,
  type Stage,
} from "./receptionist.ts";

export type ScreeningRecord = {
  call_sid: string;
  stage: Stage;
  state: ScreeningState;
  owner_decision: "accepted" | "voicemail" | "timeout" | null;
  bridged: boolean | null;
  call_logs?: { from_number: string; to_number: string; status: string };
};
export type ScreeningConfig = {
  supabaseUrl: string;
  serviceKey: string;
  owner: "Landon" | "Connor";
  voice: string;
  dial: (callerId: string, callSid: string) => string;
  voicemail: (intro?: string) => string;
};
const VALID_SID = /^CA[0-9a-f]{32}$/i;
async function request(
  config: ScreeningConfig,
  path: string,
  method = "GET",
  body?: unknown,
  prefer = "",
) {
  const response = await fetch(config.supabaseUrl + "/rest/v1/" + path, {
    method,
    headers: {
      apikey: config.serviceKey,
      Authorization: "Bearer " + config.serviceKey,
      "Content-Type": "application/json",
      ...(prefer ? { Prefer: prefer } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(2500),
  });
  if (!response.ok) throw new Error("screening_store_http_" + response.status);
  const text = await response.text();
  return text ? JSON.parse(text) : [];
}
export async function readScreening(
  config: ScreeningConfig,
  callSid: string,
): Promise<ScreeningRecord | null> {
  if (!VALID_SID.test(callSid)) return null;
  const rows = await request(
    config,
    "call_screenings?call_sid=eq." + callSid +
      "&select=*,call_logs(from_number,to_number,status)",
  );
  return rows[0] ?? null;
}
function render(
  config: ScreeningConfig,
  record: ScreeningRecord,
  callerId: string,
): string {
  const state = record.state;
  // A stale Gather is not permission to redial after an owner decision.
  if (
    record.owner_decision || record.bridged !== null ||
    ![
      "screening",
      "screening-purpose",
      "screening-insufficient",
      "screening-no-input",
      "screened-awaiting-owner",
      "screened-solicitation",
    ].includes(record.call_logs?.status || "")
  ) {
    return "<Response></Response>";
  }
  if (state.action === "gather") {
    return renderGather(
      state,
      config.supabaseUrl + "/functions/v1/handle-call",
      config.voice,
    );
  }
  if (state.action === "reject") {
    return `<Response><Say voice="${escapeXml(config.voice)}">${
      escapeXml(state.prompt)
    }</Say><Hangup/></Response>`;
  }
  if (state.action === "voicemail") return config.voicemail(state.prompt);
  return config.dial(callerId, record.call_sid).replace(
    "<Response>",
    `<Response><Say voice="${escapeXml(config.voice)}">${
      escapeXml(state.prompt)
    }</Say>`,
  );
}
export async function startReceptionist(
  config: ScreeningConfig,
  callSid: string,
  callerId: string,
): Promise<string> {
  if (!VALID_SID.test(callSid)) {
    return config.voicemail(
      "Please leave your name, the best number to reach you, and a message after the beep.",
    );
  }
  try {
    await request(config, "call_screenings?on_conflict=call_sid", "POST", {
      call_sid: callSid,
      script_version: SCRIPT_VERSION,
      stage: "purpose",
      state: initialState(new Date().toISOString()),
    }, "resolution=ignore-duplicates,return=minimal");
    const record = await readScreening(config, callSid);
    return record ? render(config, record, callerId) : config.voicemail(
      "Please leave your name, the best number to reach you, and a message after the beep.",
    );
  } catch {
    console.error("[receptionist] start persistence unavailable");
    return config.voicemail(
      "Please leave your name, the best number to reach you, and a message after the beep.",
    );
  }
}
export async function continueReceptionist(
  config: ScreeningConfig,
  data: Record<string, string>,
  step: string,
  callerId: string,
): Promise<string> {
  const callSid = data.CallSid || "";
  if (
    !VALID_SID.test(callSid) || !["purpose", "clarify", "name"].includes(step)
  ) {
    return config.voicemail(
      "Please leave your name, the best number to reach you, and a message after the beep.",
    );
  }
  try {
    let record = await readScreening(config, callSid);
    if (
      !record || record.call_logs?.from_number !== data.From ||
      record.call_logs?.to_number !== data.To
    ) {
      return config.voicemail(
        "Please leave your name, the best number to reach you, and a message after the beep.",
      );
    }
    if (
      record.stage === step && !record.owner_decision && record.bridged === null
    ) {
      const state = advance(
        record.state,
        {
          speech: data.SpeechResult,
          digits: data.Digits,
          confidence: data.Confidence,
        },
        config.owner,
        new Date().toISOString(),
      );
      // Compare-and-swap: duplicates cannot append twice or overwrite a later turn.
      await request(
        config,
        "call_screenings?call_sid=eq." + callSid +
          "&stage=eq." + step + "&owner_decision=is.null&bridged=is.null",
        "PATCH",
        { stage: state.stage, state },
        "return=minimal",
      );
      record = await readScreening(config, callSid);
    }
    return record ? render(config, record, callerId) : config.voicemail(
      "Please leave your name, the best number to reach you, and a message after the beep.",
    );
  } catch {
    console.error("[receptionist] turn persistence unavailable");
    return config.voicemail(
      "Please leave your name, the best number to reach you, and a message after the beep.",
    );
  }
}
export async function recordScreeningOutcome(
  config: ScreeningConfig,
  callSid: string,
  event:
    | "accepted"
    | "voicemail"
    | "timeout"
    | "bridged"
    | "unbridged"
    | "voicemail_received",
): Promise<boolean> {
  if (!VALID_SID.test(callSid)) return false;
  try {
    const now = new Date().toISOString();
    let filter = "&stage=eq.done";
    let patch: Record<string, unknown>;
    if (event === "bridged" || event === "unbridged") {
      filter += "&bridged=is.null";
      patch = {
        bridged: event === "bridged",
        dial_completed_at: now,
        updated_at: now,
      };
    } else if (event === "voicemail_received") {
      filter = "&voicemail_received_at=is.null";
      patch = { voicemail_received_at: now, updated_at: now };
    } else {
      filter += "&owner_decision=is.null";
      patch = { owner_decision: event, updated_at: now };
    }
    await request(
      config,
      "call_screenings?call_sid=eq." + callSid + filter,
      "PATCH",
      patch,
      "return=minimal",
    );
    return true; // zero rows is expected for legacy/direct calls and retries
  } catch {
    console.error("[receptionist] outcome persistence unavailable");
    return false;
  }
}
