import test from "node:test";
import assert from "node:assert/strict";
import { dataErrorCode } from "../lib/data-error";
test("diagnostics classify known failures without exposing credentials or SQL", () => {
  assert.equal(dataErrorCode(new Error("Banco não configurado")), "DATABASE_URL_MISSING");
  assert.equal(dataErrorCode(new Error("Configure TLS pelo certificado")), "DATABASE_URL_SSL_PARAMETERS");
  assert.equal(dataErrorCode(Object.assign(new Error("private credentials"), {code:"28P01"})), "28P01");
  assert.equal(dataErrorCode(Object.assign(new Error("private SQL"), {code:"private value"})), "DATA_QUERY_FAILED");
  assert.equal(dataErrorCode(new Error("connection timeout: private host")), "DATABASE_TIMEOUT");
  assert.equal(dataErrorCode({message:"private value"}), "DATA_QUERY_FAILED");
});
