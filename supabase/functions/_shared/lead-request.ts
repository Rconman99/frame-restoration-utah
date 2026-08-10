export type LeadRequestPayload = Record<string, unknown>;

export type ParsedLeadRequest = {
  payload: LeadRequestPayload;
  nativeForm: boolean;
};

export type ValidLeadContact = {
  ok: true;
  name: string;
  email: string;
  phone: string;
};

export type InvalidLeadContact = {
  ok: false;
  error: "name_required" | "valid_contact_required";
};

export const MAX_LEAD_REQUEST_BYTES = 32 * 1024;
export const MAX_LEAD_FIELDS = 32;
export const LEAD_HONEYPOT_FIELD = "company_website";

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

const LEAD_FIELD_BYTE_LIMITS: Record<string, number> = {
  name: 640,
  first_name: 320,
  last_name: 320,
  email: 320,
  phone: 64,
  address: 2000,
  service: 640,
  issue: 640,
  message: 20_000,
  source_page: 2000,
  city: 640,
  zip: 64,
  sms_consent: 16,
  submission_key: 64,
  gclid: 1000,
  fbclid: 1000,
  msclkid: 1000,
  gbraid: 1000,
  wbraid: 1000,
  utm_source: 1000,
  utm_medium: 1000,
  utm_campaign: 1000,
  utm_term: 1000,
  utm_content: 1000,
  landing_page: 4000,
  referrer: 4000,
  [LEAD_HONEYPOT_FIELD]: 1000,
};

export class LeadRequestError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    public readonly nativeForm: boolean,
  ) {
    super(code);
    this.name = "LeadRequestError";
  }
}

function requestError(
  code: string,
  status: number,
  nativeForm: boolean,
): never {
  throw new LeadRequestError(code, status, nativeForm);
}

function validatePayload(
  value: unknown,
  nativeForm: boolean,
): LeadRequestPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return requestError("invalid_lead_payload", 400, nativeForm);
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > MAX_LEAD_FIELDS) {
    return requestError("too_many_lead_fields", 400, nativeForm);
  }
  for (const [key, fieldValue] of entries) {
    const maxBytes = LEAD_FIELD_BYTE_LIMITS[key];
    if (!maxBytes) return requestError("unknown_lead_field", 400, nativeForm);
    if (
      key === "sms_consent" &&
      (typeof fieldValue === "boolean" || fieldValue === 0 || fieldValue === 1)
    ) continue;
    if (typeof fieldValue !== "string") {
      return requestError("invalid_lead_field_type", 400, nativeForm);
    }
    if (encoder.encode(fieldValue).byteLength > maxBytes) {
      return requestError("lead_field_too_large", 413, nativeForm);
    }
    for (const character of fieldValue) {
      const codePoint = character.codePointAt(0) ?? 0;
      if (
        (codePoint < 32 && ![9, 10, 13].includes(codePoint)) ||
        codePoint === 127 || (codePoint >= 128 && codePoint <= 159)
      ) {
        return requestError("invalid_lead_field_control", 400, nativeForm);
      }
    }
  }
  return value as LeadRequestPayload;
}

async function readBoundedBody(
  req: Request,
  nativeForm: boolean,
): Promise<Uint8Array> {
  const contentLength = req.headers.get("content-length");
  if (contentLength !== null) {
    if (!/^\d{1,10}$/.test(contentLength)) {
      return requestError("invalid_content_length", 400, nativeForm);
    }
    if (Number(contentLength) > MAX_LEAD_REQUEST_BYTES) {
      return requestError("lead_request_too_large", 413, nativeForm);
    }
  }
  if (!req.body) return new Uint8Array();

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_LEAD_REQUEST_BYTES) {
        await reader.cancel("lead_request_too_large");
        return requestError("lead_request_too_large", 413, nativeForm);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

function decodeBody(body: Uint8Array, nativeForm: boolean): string {
  try {
    return decoder.decode(body);
  } catch {
    return requestError("invalid_utf8", 400, nativeForm);
  }
}

function payloadFromEntries(
  entries: Iterable<[string, FormDataEntryValue]>,
  nativeForm: boolean,
): LeadRequestPayload {
  const payload: LeadRequestPayload = {};
  const seen = new Set<string>();
  let count = 0;
  for (const [key, value] of entries) {
    count += 1;
    if (count > MAX_LEAD_FIELDS) {
      return requestError("too_many_lead_fields", 400, nativeForm);
    }
    if (seen.has(key)) {
      return requestError("duplicate_lead_field", 400, nativeForm);
    }
    if (typeof value !== "string") {
      return requestError("lead_file_not_allowed", 400, nativeForm);
    }
    seen.add(key);
    payload[key] = value;
  }
  return validatePayload(payload, nativeForm);
}

export async function parseLeadRequest(
  req: Request,
): Promise<ParsedLeadRequest> {
  const fullContentType = req.headers.get("content-type") || "";
  const mediaType = fullContentType.split(";", 1)[0].trim().toLowerCase();
  const nativeForm = mediaType === "application/x-www-form-urlencoded" ||
    mediaType === "multipart/form-data";
  if (
    mediaType !== "application/json" &&
    mediaType !== "application/x-www-form-urlencoded" &&
    mediaType !== "multipart/form-data"
  ) {
    return requestError("unsupported_lead_content_type", 415, nativeForm);
  }

  const body = await readBoundedBody(req, nativeForm);
  if (mediaType === "application/json") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(decodeBody(body, false));
    } catch (error) {
      if (error instanceof LeadRequestError) throw error;
      return requestError("invalid_lead_json", 400, false);
    }
    return { payload: validatePayload(parsed, false), nativeForm: false };
  }

  if (mediaType === "application/x-www-form-urlencoded") {
    const form = new URLSearchParams(decodeBody(body, true));
    return {
      payload: payloadFromEntries(form.entries(), true),
      nativeForm: true,
    };
  }

  try {
    // Deno's stream reader exposes Uint8Array<ArrayBufferLike>, while
    // Response's BodyInit contract requires an owned ArrayBuffer-backed body.
    // Copy the bounded bytes so multipart parsing is both type-safe and cannot
    // observe a shared/resizable backing buffer.
    const ownedBody = new ArrayBuffer(body.byteLength);
    new Uint8Array(ownedBody).set(body);
    const form = await new Response(ownedBody, {
      headers: { "Content-Type": fullContentType },
    }).formData();
    return {
      payload: payloadFromEntries(form.entries(), true),
      nativeForm: true,
    };
  } catch (error) {
    if (error instanceof LeadRequestError) throw error;
    return requestError("invalid_multipart_form", 400, true);
  }
}

function text(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export function normalizeUsPhone(value: unknown): string | null {
  const candidate = typeof value === "string" ? value.trim() : "";
  if (candidate.length > 64) return null;
  if (!candidate || !/^\+?[0-9().\-\s]+$/.test(candidate)) return null;
  let digits = candidate.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(digits)) return null;
  return `+1${digits}`;
}

export function normalizeLeadEmail(value: unknown): string | null {
  const candidate = typeof value === "string" ? value.trim() : "";
  if (!candidate || candidate.length > 254 || /\s/.test(candidate)) return null;
  const parts = candidate.split("@");
  if (parts.length !== 2) return null;
  const [local, domain] = parts;
  if (
    !local || local.length > 64 || local.startsWith(".") ||
    local.endsWith(".") || local.includes("..") ||
    !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local)
  ) return null;
  const labels = domain.split(".");
  if (labels.length < 2 || domain.length > 253) return null;
  for (const label of labels) {
    if (
      !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label)
    ) return null;
  }
  if (!/^(?:[A-Za-z]{2,63}|xn--[A-Za-z0-9-]{2,59})$/.test(labels.at(-1)!)) {
    return null;
  }
  return candidate;
}

export function validateLeadContact(
  payload: LeadRequestPayload,
): ValidLeadContact | InvalidLeadContact {
  const explicitName = text(payload.name, 160);
  const combinedName = [
    text(payload.first_name, 80),
    text(payload.last_name, 80),
  ].filter(Boolean).join(" ");
  const name = explicitName || combinedName;
  if (
    !name || !/\p{L}/u.test(name) ||
    /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(name)
  ) {
    return { ok: false, error: "name_required" };
  }

  const phone = normalizeUsPhone(payload.phone) ?? "";
  const email = normalizeLeadEmail(payload.email) ?? "";
  if (!phone && !email) {
    return { ok: false, error: "valid_contact_required" };
  }
  return { ok: true, name, email, phone };
}

export function leadHoneypotFilled(payload: LeadRequestPayload): boolean {
  return text(payload[LEAD_HONEYPOT_FIELD], 1000).length > 0;
}

export function leadSuccessResponse(
  nativeForm: boolean,
  headers: Record<string, string> = {},
): Response {
  if (nativeForm) {
    return new Response(null, {
      status: 303,
      headers: {
        ...headers,
        "Location":
          "https://www.framerestorationutah.com/thank-you?lead=success&form=fallback",
        "Cache-Control": "no-store",
      },
    });
  }
  return Response.json(
    { success: true, message: "Lead received!" },
    { status: 200, headers: { ...headers, "Cache-Control": "no-store" } },
  );
}

export function leadFailureResponse(
  nativeForm: boolean,
  status: number,
  code: string,
  headers: Record<string, string> = {},
  retryAfterSeconds?: number,
): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("Cache-Control", "no-store");
  if (retryAfterSeconds && retryAfterSeconds > 0) {
    responseHeaders.set("Retry-After", String(retryAfterSeconds));
  }
  if (!nativeForm) {
    responseHeaders.set("Content-Type", "application/json; charset=utf-8");
    return new Response(JSON.stringify({ success: false, error: code }), {
      status,
      headers: responseHeaders,
    });
  }

  responseHeaders.set("Content-Type", "text/html; charset=utf-8");
  return new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Request not sent</title><main style="max-width:40rem;margin:4rem auto;padding:1rem;font-family:system-ui"><h1>We could not send that request.</h1><p>Please check your name and phone or email, then try again. You can also call <a href="tel:+14352928802">435-292-8802</a>.</p><p><a href="https://www.framerestorationutah.com/#contact">Return to the form</a></p></main>`,
    { status, headers: responseHeaders },
  );
}
