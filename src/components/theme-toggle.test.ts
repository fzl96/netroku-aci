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

test("themeTogglePresentation stays neutral before mount", async () => {
  const { themeTogglePresentation } = await import("./theme-toggle");

  assert.equal(themeTogglePresentation("dark", false), null);
});

test("themeTogglePresentation describes the mounted dark-state action", async () => {
  const { themeTogglePresentation } = await import("./theme-toggle");

  assert.deepEqual(themeTogglePresentation("dark", true), {
    icon: "sun",
    label: "Switch to light mode",
    nextTheme: "light",
  });
});
