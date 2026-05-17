# Light Hover Warmth Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make light-mode hover and highlighted surfaces warmer across the app.

**Architecture:** Adjust the shared light-mode `--muted` and `--accent` semantic tokens so buttons, rows, menus, and other interaction surfaces inherit the same warmer clay tint. Keep dark mode untouched to preserve the intentionally neutral monochrome dark palette.

**Tech Stack:** CSS design tokens, Tailwind token mapping

---

### Task 1: Warm the shared light interaction tokens

**Files:**
- Modify: `src/app/globals.css`

**Steps:**
1. Increase chroma and shift hue of light-mode `--muted` toward the sidebar accent family.
2. Apply the same warmer value to light-mode `--accent` so menus and focus/highlight states align with button and table hovers.
3. Leave dark-mode tokens unchanged.

### Task 2: Verify

**Steps:**
1. Run a production build to confirm the token change compiles cleanly.
