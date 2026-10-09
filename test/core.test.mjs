import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { redactValue, sanitizeMessage } from "../src/redact.mjs";
import { TripoError, errorSnapshot, isDefinitiveRemoteRejection } from "../src/errors.mjs";
import { hashObject, stableStringify } from "../src/util/misc.mjs";

describe("redact", () => {
  it("redacts bearer tokens and JWTs in messages", () => {
    assert.equal(sanitizeMessage("got Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abcdefabcdef back"), "got Bearer [REDACTED] back");
    assert.equal(sanitizeMessage("token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.eyJhbGciOiJIUzI1NiJ9 here"), "token [REDACTED] here");
  });
  it("redacts sensitive object keys recursively", () => {
    const out = redactValue({ nested: { session_token: "abc", sts_ak: "x", keep: "y" }, authorization: "Bearer z" });
    assert.equal(out.nested.session_token, "[REDACTED]");
    assert.equal(out.nested.sts_ak, "[REDACTED]");
    assert.equal(out.nested.keep, "y");
    assert.equal(out.authorization, "[REDACTED]");
  });
});

describe("errors", () => {
  it("snapshots error contract", () => {
    const snap = errorSnapshot(new TripoError("OUTCOME_UNKNOWN", "msg", { safeToRetryPaidOperation: false, stage: "x" }));
    assert.equal(snap.code, "OUTCOME_UNKNOWN");
    assert.equal(snap.safe_to_retry_paid_operation, false);
    assert.equal(snap.submission_state, "not_submitted");
  });
  it("classifies definitive rejections", () => {
    assert.equal(isDefinitiveRemoteRejection(new TripoError("INSUFFICIENT_CREDITS", "x")), true);
    assert.equal(isDefinitiveRemoteRejection(new TripoError("REMOTE_API_ERROR", "x")), true);
    assert.equal(isDefinitiveRemoteRejection(new TripoError("HTTP_ERROR", "x")), false);
    assert.equal(isDefinitiveRemoteRejection(new TripoError("HTTP_ERROR", "x", { details: { http_status: 422 } })), true);
    assert.equal(isDefinitiveRemoteRejection(new TripoError("HTTP_ERROR", "x", { details: { http_status: 408 } })), false);
    assert.equal(isDefinitiveRemoteRejection(new TripoError("HTTP_ERROR", "x", { details: { http_status: 503 } })), false);
  });
});

describe("misc", () => {
  it("stable stringifies regardless of key order", () => {
    assert.equal(stableStringify({ b: 1, a: [2, { d: 4, c: 3 }] }), stableStringify({ a: [2, { c: 3, d: 4 }], b: 1 }));
    assert.equal(hashObject({ a: 1 }), hashObject({ a: 1 }));
    assert.notEqual(hashObject({ a: 1 }), hashObject({ a: 2 }));
  });
});
