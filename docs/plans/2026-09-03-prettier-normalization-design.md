# Prettier normalization design

## Goal

Adopt one reproducible formatting style for the entire repository so editor saves do not produce unrelated formatting changes in files that have already been normalized.

## Configuration

Install exact versions of Prettier and the official Tailwind CSS Prettier plugin. Use a typed ESM configuration with three deliberate style choices: a 100-column print width, no routine statement-ending semicolons, and single quotes in JavaScript and TypeScript. Leave all other formatting behavior at Prettier's defaults.

Configure the Tailwind plugin with `src/app/globals.css`, the Tailwind v4 stylesheet entry point, and teach it to sort class strings passed to the project's `cn` and `cva` helpers.

## Commands and scope

Add `format` and `format:check` package scripts. The first formats the repository; the second provides a non-mutating formatting check suitable for local verification or CI.

Add a `.prettierignore` for generated, dependency, build, coverage, cache, and environment output. Run the formatter once across every remaining supported file. Do not preserve legacy per-directory quote or semicolon styles: this migration intentionally establishes one canonical style.

## Verification

After formatting, require `format:check`, ESLint, and the test suite to pass. Review the resulting diff for generated files, unexpected semantic edits, or user-owned files outside the approved normalization scope.
