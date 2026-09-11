import test from "node:test";
import assert from "node:assert/strict";
import {reportRequest} from "./voice-screening-report.mjs";
test("default report is aggregate only and cannot address Idaho",()=> {
  const r=reportRequest(["utah"]); assert.equal(r.private_detail,false);
  assert.match(r.sql,/call_screening_daily/); assert.doesNotMatch(r.sql,/state|phone|notes/);
  assert.throws(()=>reportRequest(["idaho"])); assert.throws(()=>reportRequest(["constructor"]));
});
test("days and call ids are bounded; SQL injection and unknown switches fail closed",()=>{
  assert.match(reportRequest(["texas","--days","1"]).sql,/- 0 /);
  for(const args of [["utah","--days","0"],["utah","--days","31"],["utah","--days","1;drop"],["utah","--call","CA';drop"],["utah","--all"],["utah","--days"]]) assert.throws(()=>reportRequest(args));
});
test("private transcript requires one explicit exact CallSid",()=>{
  const r=reportRequest(["texas","--call","CA"+"2".repeat(32)]);
  assert.equal(r.private_detail,true); assert.match(r.sql,/limit 1$/); assert.doesNotMatch(r.sql,/\bupdate\b|\bdelete\b/i);
});
