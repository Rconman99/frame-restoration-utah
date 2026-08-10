export const MAX_RESEND_WEBHOOK_BYTES = 64 * 1024;

const decoder = new TextDecoder("utf-8", { fatal: true });

export class WebhookRequestError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: 400 | 413,
  ) {
    super(code);
    this.name = "WebhookRequestError";
  }
}

function requestError(code: string, status: 400 | 413): never {
  throw new WebhookRequestError(code, status);
}

export async function readBoundedWebhookBody(
  request: Request,
): Promise<string> {
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    if (!/^\d{1,10}$/.test(contentLength)) {
      return requestError("invalid_content_length", 400);
    }
    if (Number(contentLength) > MAX_RESEND_WEBHOOK_BYTES) {
      return requestError("webhook_body_too_large", 413);
    }
  }

  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_RESEND_WEBHOOK_BYTES) {
        await reader.cancel("webhook_body_too_large");
        return requestError("webhook_body_too_large", 413);
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
  try {
    return decoder.decode(body);
  } catch {
    return requestError("invalid_utf8", 400);
  }
}
