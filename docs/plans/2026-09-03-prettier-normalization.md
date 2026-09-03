# Prettier Normalization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Install a pinned formatter and normalize every supported repository file to one stable style.

**Architecture:** A root ESM Prettier configuration owns formatting for every supported file. The official Tailwind plugin reads the Tailwind v4 stylesheet and sorts classes in JSX attributes and the `cn`/`cva` helpers; package scripts expose mutating and read-only formatter commands.

**Tech Stack:** Bun, Prettier 3, prettier-plugin-tailwindcss, Tailwind CSS 4, ESLint 9, Bun test

---

### Task 1: Install and configure formatting tools

**Files:**

- Create: `prettier.config.mjs`
- Create: `.prettierignore`
- Modify: `package.json`
- Modify: `bun.lock`

**Step 1: Install exact formatter versions**

Run: `bun add --dev --exact prettier prettier-plugin-tailwindcss`

Expected: `package.json` and `bun.lock` record exact versions of both packages.

**Step 2: Add the root configuration**

Create `prettier.config.mjs` with:

```js
/** @type {import('prettier').Config & import('prettier-plugin-tailwindcss').PluginOptions} */
const config = {
  printWidth: 100,
  semi: false,
  singleQuote: true,
  plugins: ['prettier-plugin-tailwindcss'],
  tailwindStylesheet: './src/app/globals.css',
  tailwindFunctions: ['cn', 'cva'],
}

export default config
```

**Step 3: Add explicit generated-output ignores**

Create `.prettierignore` with dependency, framework output, coverage, Prisma-generated, documentation-generated, tool cache, worktree, environment, and lockfile exclusions already represented by repository tooling. Keep tracked source and documentation format-enabled.

**Step 4: Add package scripts**

Add these entries to `package.json`:

```json
"format": "prettier . --write",
"format:check": "prettier . --check"
```

**Step 5: Confirm normalization is initially required**

Run: `bun run format:check`

Expected: FAIL and list existing files that do not yet match the new canonical format.

### Task 2: Normalize the repository

**Files:**

- Modify: all supported tracked files not excluded by `.prettierignore`

**Step 1: Apply canonical formatting**

Run: `bun run format`

Expected: Prettier completes without parse or plugin errors.

**Step 2: Audit the formatting diff**

Run: `git status --short` and `git diff --stat`

Expected: the approved formatter/configuration files and supported tracked project files change; pre-existing untracked user files remain unmodified and untracked.

**Step 3: Verify formatting**

Run: `bun run format:check`

Expected: PASS with every checked file formatted.

**Step 4: Verify linting**

Run: `bun run lint`

Expected: PASS with no ESLint errors.

**Step 5: Verify behavior**

Run: `bun test`

Expected: PASS with the complete test suite green.

**Step 6: Review and commit the normalization**

Stage only the approved normalization files and commit them separately from the design document and pre-existing user files.
