import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizedEquipmentSerial } from "../lib/equipment/serial";
test("serial comparison ignores punctuation, spaces, case and accents without dropping zeroes", () => {
  for (const value of ["SN.00 123", "sn-00123", " SN/00.123 ", "sn_00:123"])
    assert.equal(normalizedEquipmentSerial(value), "SN00123");
  assert.equal(normalizedEquipmentSerial("ÁB. 012"), "AB012");
  assert.notEqual(
    normalizedEquipmentSerial("00123"),
    normalizedEquipmentSerial("123"),
  );
  assert.equal(normalizedEquipmentSerial("N/C"), "");
  assert.equal(normalizedEquipmentSerial("sem série"), "");
});
