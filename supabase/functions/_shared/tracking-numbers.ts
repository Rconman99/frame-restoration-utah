// Twilio tracking-number placement map — the ONE place that decides commission.
//
// Ryan's commission is paid only on leads from Twilio numbers placed on SEO/AEO
// surfaces (the website and the Google Business Profiles). A Twilio number placed
// on Yelp, Birdeye, BBB, Angi, HomeAdvisor, etc. is "Not SEO/AEO": its calls are
// still logged as leads, but are labeled not_seo_aeo and are NOT commission-eligible.
//
// MOVING A NUMBER = ONE EDIT HERE: change its `placement` (and `where`), then
// redeploy handle-call. Commission is derived from placement; there is no separate
// flag to forget. Unmapped numbers default to NOT commission-eligible.
//
// Calls dialed straight to Landon's personal cell (435-302-4422, kept on
// Yelp/Birdeye on purpose) never touch Twilio, so they are never leads here.

export type Placement = "seo_aeo" | "directory" | "other";

export type TrackingNumber = {
  /** Lead source label written to leads.call_source. */
  source: string;
  /** Where the number is published. Only "seo_aeo" pays commission. */
  placement: Placement;
  /** Human note: which sites/listings show this number. */
  where: string;
  /** Short label whispered to Landon (callee only) before the bridge. */
  whisper: string;
};

export const TRACKING_NUMBERS: Readonly<Record<string, TrackingNumber>> = {
  "+14352928802": {
    source: "google_website",
    placement: "seo_aeo",
    where: "framerestorationutah.com + Heber GBP (canonical NAP)",
    whisper: "Website or Google lead",
  },
  "+14356108978": {
    source: "slc_backlink",
    placement: "seo_aeo",
    where: "Contractor ReIndependence SLC backlink",
    whisper: "Website lead",
  },
  "+18014620526": {
    source: "slc_gbp",
    placement: "seo_aeo",
    where: "Murray/SLC GBP",
    whisper: "Google lead",
  },
  // Example of a moved number (do not uncomment without a real number):
  // "+1XXXXXXXXXX": { source: "yelp", placement: "directory", where: "Yelp listing", whisper: "Yelp lead" },
};

export const NOT_SEO_AEO_BUCKET = "not_seo_aeo" as const;
export const NOT_SEO_AEO_LABEL =
  "Not SEO/AEO - directory/other placement (no commission)" as const;

export type Attribution = {
  source: string;
  placement: Placement | "unmapped";
  commission: boolean;
};

function e164(raw: string): string {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return "";
}

/** Attribution for the Twilio number the caller dialed. */
export function attributeDialedNumber(
  toNumber: string,
  map: Readonly<Record<string, TrackingNumber>> = TRACKING_NUMBERS,
): Attribution {
  const entry = map[e164(toNumber)];
  if (!entry) return { source: "unknown", placement: "unmapped", commission: false };
  const source = entry.placement === "seo_aeo"
    ? entry.source
    : `${NOT_SEO_AEO_BUCKET}:${entry.source}`;
  return { source, placement: entry.placement, commission: entry.placement === "seo_aeo" };
}

export function isTrackedNumber(
  toNumber: string,
  map: Readonly<Record<string, TrackingNumber>> = TRACKING_NUMBERS,
): boolean {
  return e164(toNumber) in map;
}

const DIRECTORY_UTM = new Set([
  "yelp", "birdeye", "bbb", "homeadvisor", "angi", "angies_list", "thumbtack", "nextdoor", "directory",
]);

/**
 * Does this lead row pay Ryan commission? (Ryan, 2026-11-03)
 * ONLY Twilio calls on seo_aeo-placed numbers, i.e. commission_eligible === true
 * as stamped by handle-call. Website forms, directory/other placements,
 * unmapped numbers and rows with no flag never pay.
 */
export function leadPaysCommission(row: Record<string, unknown>): boolean {
  if (isLegacyLead(row)) return true;
  return row.commission_eligible === true;
}

/**
 * Grandfathering (Ryan, 2026-11-03: "only net new"). The commission split went
 * live with handle-call v58 at 2026-11-03 19:10 UTC. Every lead created before
 * that (or with no parseable created_at) was SEO/AEO and keeps the pre-#362
 * rule: it counts as Ryan's lead and pays commission. Never reclassified.
 */
export const COMMISSION_SPLIT_CUTOFF_ISO = "2026-11-03T19:10:00Z" as const;
const COMMISSION_SPLIT_CUTOFF_MS = Date.parse(COMMISSION_SPLIT_CUTOFF_ISO);
export function isLegacyLead(row: Record<string, unknown>): boolean {
  const t = Date.parse(String(row.created_at ?? ""));
  return !Number.isFinite(t) || t < COMMISSION_SPLIT_CUTOFF_MS;
}

/** Non-commission lead that is still a real lead: a website form (not directory-sourced). */
export function isWebsiteFormLead(row: Record<string, unknown>): boolean {
  if (isLegacyLead(row)) return false;
  if (row.commission_eligible === true || row.commission_eligible === false) return false;
  const callSource = String(row.call_source ?? "").trim();
  const page = String(row.source_page ?? "").trim().toLowerCase();
  if (callSource || page.startsWith("inbound-")) return false;
  const utm = String(row.utm_source ?? "").trim().toLowerCase()
    .replace(/[\s.-]+/g, "_").replace(/_com$/, "");
  return !DIRECTORY_UTM.has(utm);
}

/**
 * Label Landon hears before the call bridges. Non-SEO/AEO placements always
 * end in ", not SEO" so a moved number can never sound like a commission lead.
 */
export function sourceWhisperLabel(
  toNumber: string,
  map: Readonly<Record<string, TrackingNumber>> = TRACKING_NUMBERS,
): string {
  const entry = map[e164(toNumber)];
  if (!entry) return "Untracked line, not SEO";
  const base = (entry.whisper || entry.source.replace(/_/g, " ") + " lead").trim();
  return entry.placement === "seo_aeo" ? base : `${base}, not SEO`;
}

function xmlText(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

/** TwiML for the <Number url> whisper: played to the answering party only. */
export function sourceWhisperTwiml(label: string, voice = "Polly.Joanna"): string {
  return `<Response>\n  <Say voice="${xmlText(voice)}">${xmlText(label)}.</Say>\n</Response>`;
}

/**
 * Ring-time SMS to Landon: "<Source> lead calling from <caller>".
 * Directory/other/unmapped placements say "not SEO/AEO".
 */
export function sourceAlertSmsText(
  toNumber: string,
  fromNumber: string,
  map: Readonly<Record<string, TrackingNumber>> = TRACKING_NUMBERS,
): string {
  const entry = map[e164(toNumber)];
  const caller = e164(fromNumber) || "unknown number";
  if (!entry) return `Untracked line (not SEO/AEO) lead calling from ${caller}`;
  const base = (entry.whisper || entry.source.replace(/_/g, " ") + " lead").trim();
  return entry.placement === "seo_aeo"
    ? `${base} calling from ${caller}`
    : `${base} (not SEO/AEO) calling from ${caller}`;
}

/**
 * Fire-and-forget wrapper: never throws, so an SMS failure can't drop the call.
 */
export async function sendSourceAlertSafely(
  send: () => Promise<unknown>,
  log: (msg: string, err: unknown) => void = console.error,
): Promise<void> {
  try {
    await send();
  } catch (err) {
    log("[handle-call] ring-time source SMS failed (call unaffected):", err);
  }
}
