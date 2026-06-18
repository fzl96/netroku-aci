# Sidebar Warm Accent Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make sidebar active and hover backgrounds warmer in light mode.

**Architecture:** Adjust the shared light-mode `--sidebar-accent` design token so existing sidebar components inherit the warmer tone without changing component logic. Leave dark mode neutral to preserve the existing monochrome dark palette.

**Tech Stack:** CSS design tokens, Tailwind token mapping

---

### Task 1: Warm the sidebar accent token

**Files:**
- Modify: `src/app/globals.css`

**Steps:**
1. Change the light-mode `--sidebar-accent` token from a nearly neutral warm gray to a slightly more chromatic clay tint.
2. Keep dark mode unchanged.

### Task 2: Verify

**Steps:**
1. Run targeted lint/build verification as appropriate for a CSS-only token change.
