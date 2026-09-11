#!/usr/bin/env node
// Private operator readout using the already-authenticated Supabase CLI.
// Read-only. No credential retrieval, caller texts in default output, or files written.
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
export const PROJECTS = Object.freeze({utah:"hdcflshhomzildwqlmwh", texas:"wroaxatalhzslxkfmpse"});
export function reportRequest(args) {
  const [market, flag, value, ...rest] = args;
  if (!Object.hasOwn(PROJECTS, market) || rest.length || (flag && !["--days","--call"].includes(flag))) throw new Error("Use: node scripts/voice-screening-report.mjs utah|texas [--days 1..30 | --call CA…]");
  if (flag === "--call") {
    if (!/^CA[0-9a-f]{32}$/i.test(value || "")) throw new Error("A valid CallSid is required.");
    return {market, project:PROJECTS[market], private_detail:true, sql:
      "select s.call_sid,s.script_version,s.created_at,s.stage,s.state,s.owner_decision,s.bridged,s.voicemail_received_at,s.review_label,s.review_notes,l.lead_id,l.status as call_status,l.source_page from public.call_screenings s join public.call_logs l using(call_sid) where s.call_sid = '" + value + "' limit 1"};
  }
  const days = flag ? Number(value) : 7;
  if (!Number.isInteger(days) || days < 1 || days > 30) throw new Error("Days must be an integer from 1 to 30.");
  return {market, project:PROJECTS[market], private_detail:false, sql:
    "select * from public.call_screening_daily where day_utc >= (now() at time zone 'UTC')::date - " + (days-1) + " order by day_utc desc,script_version,source_page"};
}
export function main(args) {
  let request;
  try { request = reportRequest(args); } catch (error) { console.error(error.message); return 2; }
  if (request.private_detail) console.error("PRIVATE: caller-reported screening text. Do not paste into GitHub, public analytics, shared context or tickets.");
  const result = spawnSync("supabase",["db","query","--linked","--project-ref",request.project,"--output","json",request.sql],
    {encoding:"utf8",timeout:20000,maxBuffer:1024*1024});
  if (result.status !== 0) { console.error("Readout unavailable. Confirm CLI access and the reviewed call_screenings migration; no data or success is assumed."); return 1; }
  try {
    console.log(JSON.stringify({market:request.market,scope:"assistant screening only; not full-call transcription",data:JSON.parse(result.stdout)},null,2));
  } catch { console.error("Invalid provider output; no report produced."); return 1; }
  return 0;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = main(process.argv.slice(2));
