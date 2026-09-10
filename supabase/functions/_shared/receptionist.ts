// Approved lead-first receptionist. Pure, bounded, deterministic; caller text
// is evidence, never instructions or a verified identity. Shared UT/TX contract.
export const SCRIPT_VERSION = "lead-first-2026-09-10-v2";
export const GREETING =
  "Hi, thanks for calling Frame Restoration. I'm the team's virtual assistant. How can we help you today?";
export const NAME_PROMPT = "Got it. Who am I speaking with?";
export const CLARIFY_PROMPT = "Sure—what's the call about?";
export const REPAIR_PROMPT =
  "You can press one to leave a message. Otherwise, what can we help you with?";
export const SALES_DECLINE =
  "We're not taking sales calls on this line. Thanks for understanding. Goodbye.";

export type Stage = "purpose" | "clarify" | "name" | "done";
export type Turn = {
  role: "assistant" | "caller";
  text: string;
  at: string;
  source: "approved_script" | "twilio_speech" | "twilio_dtmf" | "no_input";
  confidence?: number;
};
export type ScreeningState = {
  stage: Stage;
  action: "gather" | "connect" | "voicemail" | "reject";
  name: string;
  purpose: string;
  reason: string;
  prompt: string;
  turns: Turn[];
};
export function cleanText(value: unknown, limit = 1000): string {
  return typeof value === "string"
    ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim()
      .slice(0, limit)
    : "";
}
export function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
export function initialState(at: string): ScreeningState {
  return {
    stage: "purpose",
    action: "gather",
    name: "",
    purpose: "",
    reason: "awaiting_purpose",
    prompt: GREETING,
    turns: [{
      role: "assistant",
      text: GREETING,
      at,
      source: "approved_script",
    }],
  };
}
const NAME_STOP =
  /^(?:and|but|i|we|calling|looking|having|returning|selling|offering|providing|interested|not|a|an|the|from|with|need|want|here|about|wondering|trying|sorry|hoping|in)$/i;
function plausibleName(value: string): string {
  const words = value.split(/\s+/).slice(0, 3);
  const result: string[] = [];
  for (const word of words) {
    if (NAME_STOP.test(word) || !/^[\p{L}][\p{L}'’-]*$/u.test(word)) break;
    result.push(word);
  }
  return result.join(" ").slice(0, 80);
}
export function volunteeredName(text: string): string {
  const match = text.match(
    /(?:^|[.!?]\s+|^hi[, ]+|^hello[, ]+)(?:my name is|this is|i'm|i am)\s+([^,.!?]+)/i,
  );
  return match ? plausibleName(match[1]) : "";
}
const SERVICE =
  /\b(?:roof|roofing|gutters?|storm|hail|leak|leaking|water damage|flood|fire damage|inspection|estimate|repair|replacement|restoration|claim|invoice|appointment|current project|existing project|adjuster|delivery|subcontractor)\b/i;
const HUMAN =
  /\b(?:human|real person|operator|representative)\b|\b(?:speak|talk) (?:to|with) (?:a |someone |an actual )?person\b/i;
const URGENT =
  /\b(?:flooding|active leak|water coming|water pouring|ceiling collapsed|house is on fire|roof is leaking|roof's leaking)\b/i;
export function isClearPitch(text: string): boolean {
  // Existing relationships, quoted pitches and explicit negation are ambiguous,
  // not grounds for an automatic rejection.
  if (
    /\b(?:not (?:selling|offering)|(?:you|your team) asked|existing (?:account|contract|provider)|returning your call|(?:said|told me|asked me to call))\b/i
      .test(text)
  ) return false;
  const offering =
    /\b(?:we|i)(?:'m| am| are)?\s+(?:sell(?:ing)?|offer(?:ing)?|provid(?:e|ing))\s+(?:you\s+)?(?:(?:roofing|exclusive|qualified|digital|business|more|new)\s+){0,2}(?:leads?|lead generation|marketing|seo|search engine optimization|website design|merchant services|credit card processing|business loans?)\b/i;
  const buying = /\b(?:buy|purchase)\s+(?:roofing\s+)?leads\b/i;
  const salesCall =
    /^(?:(?:this is|it is) )?(?:a )?(?:sales|solicitation|telemarketing)(?: call)?[.!]?$/i;
  const profilePitch =
    /\b(?:calling (?:about|regarding)|regarding) (?:your )?google (?:business|maps)(?: profile| listing)?\b/i;
  const customerNeed =
    /\b(?:need|want|have|our|my)\b.{0,55}\b(?:roof|leak|repair|inspection|estimate|damage|project)\b/i;
  return offering.test(text) || buying.test(text) || salesCall.test(text) ||
    (profilePitch.test(text) && !customerNeed.test(text));
}
export function advance(
  current: ScreeningState,
  input: { speech?: unknown; digits?: unknown; confidence?: unknown },
  owner: "Landon" | "Connor",
  at: string,
): ScreeningState {
  if (current.stage === "done") return current;
  const text = cleanText(input.speech);
  const digits = cleanText(input.digits, 1);
  const confidence = Number(input.confidence);
  const turn: Turn = {
    role: "caller",
    text: digits || text,
    at,
    source: digits ? "twilio_dtmf" : text ? "twilio_speech" : "no_input",
  };
  if (
    text && input.confidence !== undefined && input.confidence !== "" &&
    Number.isFinite(confidence) && confidence >= 0 && confidence <= 1
  ) turn.confidence = confidence;
  const next: ScreeningState = { ...current, turns: [...current.turns, turn] };
  const finish = (
    action: ScreeningState["action"],
    reason: string,
    prompt: string,
    stage: Stage = "done",
  ) => {
    next.stage = stage;
    next.action = action;
    next.reason = reason;
    next.prompt = prompt;
    next.turns.push({
      role: "assistant",
      text: prompt,
      at,
      source: "approved_script",
    });
    return next;
  };
  const connect = (reason: string) =>
    finish(
      "connect",
      reason,
      next.name
        ? `Thanks, ${next.name}. Let me try ${owner} for you.`
        : `Let me try ${owner} for you.`,
    );
  if (digits === "1") {
    return finish(
      "voicemail",
      "message_requested",
      "Please leave your name, the best number to reach you, and a message after the beep.",
    );
  }
  if (current.stage === "name") {
    if (isClearPitch(text)) {
      next.purpose = cleanText(`${current.purpose} / ${text}`, 1600);
      return finish("reject", "clear_solicitation", SALES_DECLINE);
    }
    if (
      text && !HUMAN.test(text) &&
      !/\b(?:rather not|prefer not|none of your|no thanks)\b/i.test(text)
    ) {
      next.name = volunteeredName(text) || plausibleName(text);
    }
    return connect(text ? "name_received_or_skipped" : "name_no_input");
  }
  if (text) {
    next.name = volunteeredName(text) || next.name;
    next.purpose = cleanText(
      current.purpose ? `${current.purpose} / ${text}` : text,
      1600,
    );
  }
  if (isClearPitch(text)) {
    return finish("reject", "clear_solicitation", SALES_DECLINE);
  }
  if (HUMAN.test(text)) return connect("human_requested");
  if (URGENT.test(text)) return connect("urgent_property_request");
  if (!text) {
    return current.stage === "clarify"
      ? finish(
        "voicemail",
        "no_input_after_repair",
        "Please leave your name, the best number to reach you, and a message after the beep.",
      )
      : finish("gather", "no_input_repair", REPAIR_PROMPT, "clarify");
  }
  // One clarification maximum. Never add a name interview after that repair.
  if (current.stage === "clarify") return connect("clarification_received");
  if (SERVICE.test(text)) {
    return next.name
      ? connect("service_request")
      : finish("gather", "optional_name", NAME_PROMPT, "name");
  }
  return finish("gather", "purpose_clarification", CLARIFY_PROMPT, "clarify");
}
export function renderGather(
  state: ScreeningState,
  baseUrl: string,
  voice: string,
): string {
  return `<Response><Gather input="dtmf speech" numDigits="1" timeout="6" speechTimeout="auto" language="en-US" actionOnEmptyResult="true" method="POST" action="${
    escapeXml(baseUrl)
  }/receptionist?step=${state.stage}"><Say voice="${escapeXml(voice)}">${
    escapeXml(state.prompt)
  }</Say></Gather></Response>`;
}
export function crmEvidence(state: ScreeningState): string {
  return `Assistant screening (${SCRIPT_VERSION}; caller-reported, speech recognition may be inaccurate). Name: ${
    state.name || "not provided"
  }. Reason: ${
    state.purpose || "not provided"
  }. Screening decision: ${state.reason}. Confirm identity, service address and job details with the caller.`;
}
