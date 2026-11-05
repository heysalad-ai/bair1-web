import test from "node:test";
import assert from "node:assert/strict";
import { createLoader } from "./helpers/load-ts.mjs";
const { keyPresets, uploadConfig, UPLOAD_URL } = createLoader()(
  "src/lib/device-setup.ts",
);
test("factory setup uses the deployed upload host and leaves credentials local", () => {
  assert.equal(UPLOAD_URL, "https://app.bair1.live/api/readings");
  const config = uploadConfig("synthetic-board");
  assert.ok(config.includes(UPLOAD_URL));
  assert.ok(config.includes("<paste your upload key locally>"));
  const configured = config.match(/BAIR1_URL\[\] = "([^"]+)"/);
  assert.ok(configured);
  assert.equal(new URL(configured[1]).href, UPLOAD_URL);
});
test("firmware and read presets separate upload from read privileges", () => {
  assert.deepEqual(keyPresets.firmware, ["write:readings"]);
  assert.ok(!keyPresets.read.includes("write:readings"));
  assert.ok(!keyPresets.firmware.includes("read:readings"));
});
