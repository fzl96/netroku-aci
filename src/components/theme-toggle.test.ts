import assert from "node:assert/strict";
import test from "node:test";

import { nextBinaryTheme } from "./theme-toggle";

test("nextBinaryTheme flips dark to light", () => {
  assert.equal(nextBinaryTheme("dark"), "light");
});

test("nextBinaryTheme treats light or unknown as dark", () => {
  assert.equal(nextBinaryTheme("light"), "dark");
  assert.equal(nextBinaryTheme(undefined), "dark");
});
