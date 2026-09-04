import {
  collectInboundMedia,
  createMediaProxyUrl,
  verifyMediaProxyToken,
} from "./inbound-media.ts";

const validUrl = "https://api.twilio.com/2010-04-01/Accounts/AC" + "a".repeat(32) + "/Messages/MM" + "b".repeat(32) + "/Media/ME" + "c".repeat(32);

Deno.test("collects bounded inbound MMS media and rejects unsafe URLs", () => {
  const media = collectInboundMedia({
    NumMedia: "3",
    MediaUrl0: validUrl,
    MediaContentType0: "image/jpeg",
    MediaUrl1: "https://example.com/not-twilio.jpg",
    MediaUrl2: validUrl + "?duplicate=1",
  });
  if (media.length !== 1 || media[0].contentType !== "image/jpeg") throw new Error("media extraction contract failed");
});

Deno.test("proxy token round-trips and expires", async () => {
  const now = Date.parse("2026-09-04T00:00:00Z");
  const media = collectInboundMedia({ NumMedia: "1", MediaUrl0: validUrl, MediaContentType0: "image/jpeg" })[0];
  const proxy = await createMediaProxyUrl("https://hdcflshhomzildwqlmwh.supabase.co/functions/v1/inbound-media", media, "test-secret", now);
  const token = new URL(proxy).searchParams.get("token") || "";
  const verified = await verifyMediaProxyToken(token, "test-secret", now);
  if (!verified || verified.url !== validUrl) throw new Error("proxy token did not verify");
  const expired = await verifyMediaProxyToken(token, "test-secret", now + (60 * 60 * 24 * 181 * 1000));
  if (expired !== null) throw new Error("expired proxy token was accepted");
});
