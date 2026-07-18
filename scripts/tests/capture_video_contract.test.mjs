import test from "node:test";
import assert from "node:assert/strict";

import { validateMediaDuration } from "../capture_video_contract.mjs";

test("accepts physical media that covers the full required duration", () => {
  assert.equal(validateMediaDuration(134.568, 134.568), 134.568);
  assert.equal(validateMediaDuration(135.02, 134.568), 135.02);
});

test("rejects physical media shorter than the full required duration", () => {
  assert.throws(
    () => validateMediaDuration(134.48, 134.568),
    /Physical capture duration 134\.480s is shorter than required 134\.568s/,
  );
});

test("rejects invalid probe output", () => {
  assert.throws(() => validateMediaDuration(Number.NaN, 134.568), /finite positive number/);
});
