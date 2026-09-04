# GitHub Actions SSH Diagnostic Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a temporary, non-blocking verbose SSH connectivity check after Tailscale connects and before deployment begins.

**Architecture:** The existing Tailscale action remains unchanged. A shell step will use the same three deployment secrets to create a mode-600 temporary key file, run a bounded verbose SSH command, and remove the key file on exit. `continue-on-error` preserves the existing deploy action even if the diagnostic cannot connect.

**Tech Stack:** GitHub Actions YAML, OpenSSH client, Bash.

## Global Constraints

- Modify only `.github/workflows/deploy.yml` for runtime behavior.
- Run the diagnostic after `Connect to Tailscale` and before `Deploy via SSH`.
- Do not print the private key or secret values.
- Keep deployment behavior intact when diagnostics fail.

---

### Task 1: Add the bounded diagnostic step

**Files:**
- Modify: `.github/workflows/deploy.yml`
- Test: GitHub Actions YAML parse and workflow review

**Interfaces:**
- Consumes: `secrets.SERVER_HOST`, `secrets.SERVER_USER`, and `secrets.SERVER_SSH_KEY`.
- Produces: verbose OpenSSH connection logs in the `Debug SSH connectivity` workflow step.

- [ ] **Step 1: Define the expected pre-change behavior**

The workflow contains `Connect to Tailscale` followed directly by `Deploy via SSH`; no OpenSSH client diagnostic step exists.

- [ ] **Step 2: Add the diagnostic step**

Insert this YAML after `Connect to Tailscale`:

```yaml
      - name: Debug SSH connectivity
        continue-on-error: true
        env:
          SERVER_HOST: ${{ secrets.SERVER_HOST }}
          SERVER_USER: ${{ secrets.SERVER_USER }}
          SERVER_SSH_KEY: ${{ secrets.SERVER_SSH_KEY }}
        run: |
          key_file="$(mktemp)"
          trap 'rm -f "$key_file"' EXIT
          printf '%s\n' "$SERVER_SSH_KEY" > "$key_file"
          chmod 600 "$key_file"
          ssh -vvv -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=25 -i "$key_file" "$SERVER_USER@$SERVER_HOST" exit
```

- [ ] **Step 3: Verify workflow syntax and secret handling**

Run: `ruby -e 'require "yaml"; YAML.load_file(".github/workflows/deploy.yml"); puts "YAML valid"'`

Expected: `YAML valid`. Confirm that the private key is only written to the temporary file, whose removal is registered with `trap`.

- [ ] **Step 4: Verify deployment behavior remains present**

Run: `rg -n 'Connect to Tailscale|Debug SSH connectivity|Deploy via SSH|continue-on-error' .github/workflows/deploy.yml`

Expected: the diagnostic is between Tailscale and deployment, and `Deploy via SSH` remains unchanged.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/deploy.yml docs/superpowers/plans/2026-07-16-github-actions-ssh-diagnostic.md
git commit -m "ci: add SSH connectivity diagnostics"
```
