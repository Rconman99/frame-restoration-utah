// Fail-closed JSON request reader for Edge Functions. Content-Length is only a
// fast rejection signal: streamed/chunked bodies are still counted byte by byte
// before any UTF-8 decoding or JSON parsing occurs.

export type BoundedJsonObjectResult =
  | { ok: true; value: Record<string, unknown> }
  | {
    ok: false;
    error: "bad_json" | "body_too_large";
    status: 400 | 413;
  };

const BAD_JSON: BoundedJsonObjectResult = {
  ok: false,
  error: "bad_json",
  status: 400,
};

const BODY_TOO_LARGE: BoundedJsonObjectResult = {
  ok: false,
  error: "body_too_large",
  status: 413,
};

function declaredBodyTooLarge(
  contentLength: string | null,
  maxBytes: number,
): boolean | null {
  if (contentLength === null) return false;
  const normalized = contentLength.trim();
  if (!/^\d+$/.test(normalized)) return null;
  try {
    return BigInt(normalized) > BigInt(maxBytes);
  } catch {
    return null;
  }
}

export async function readBoundedJsonObject(
  req: Request,
  maxBytes: number,
): Promise<BoundedJsonObjectResult> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) return BAD_JSON;

  const declaredTooLarge = declaredBodyTooLarge(
    req.headers.get("content-length"),
    maxBytes,
  );
  if (declaredTooLarge === null) return BAD_JSON;
  if (declaredTooLarge) return BODY_TOO_LARGE;
  if (!req.body) return BAD_JSON;

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        try {
          await reader.cancel("body_too_large");
        } catch {
          // The 413 remains authoritative even if the upstream stream cannot
          // be cancelled cleanly.
        }
        return BODY_TOO_LARGE;
      }
      chunks.push(value);
    }
  } catch {
    return BAD_JSON;
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const value: unknown = JSON.parse(text);
    return value && typeof value === "object" && !Array.isArray(value)
      ? { ok: true, value: value as Record<string, unknown> }
      : BAD_JSON;
  } catch {
    return BAD_JSON;
  }
}
