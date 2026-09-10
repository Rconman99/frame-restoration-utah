import assert from "node:assert/strict";
import test from "node:test";
import { verifyClientIpDeployReceipt } from "./verify-client-ip-deploy-receipt.mjs";

test("phone deployment does not require a client-IP receipt", () => {
  assert.deepEqual(verifyClientIpDeployReceipt({functionName: "handle-call"}), {required: false});
});
for (const functionName of ["handle-lead", "lead-crm"]) {
  test(functionName + " still fails closed without client-IP evidence", () => {
    assert.throws(() => verifyClientIpDeployReceipt({functionName}), /exact 40-character deploy SHA/);
  });
}
