---
name: optimize-vault
description: "Manually trigger one cycle of the VIVA vault hourly recursive optimization loop. Equivalent to the scheduled hourly run but invoked on demand. Use: /hyperagents:optimize-vault [--cycle <n>] [--focus <domain>] [--dry-run] [--full-reset]"
allowed-tools: [Read, Write, Edit, Bash, Grep, Glob, Agent]
---

# HyperAgents Optimize-Vault Command

You are orchestrating a single cycle of the VIVA vault recursive improvement loop — the same cycle that runs automatically every hour via the `Schedule` hook. This command lets you trigger the loop on demand, inspect its outputs, or focus it on a specific vault domain.

## Arguments

Parse the user's arguments:

- `--cycle <n>`: Override the cycle number (default: read from `.hyperagents/vault-state.json`, or 0 if uninitialized)
- `--focus <domain>`: Restrict mutations to one domain: `vision`, `insights`, `verification`, or `actions` (default: all domains based on health scores)
- `--dry-run`: Survey and score mutations but do not write any changes — show a diff of what *would* change and the projected fitness delta
- `--resume`: Continue from the cycle number stored in `.hyperagents/vault-state.json` and re-run any open tasks deferred from the previous cycle (default behaviour; explicit flag makes intent clear)
- `--full-reset`: Archive all current vault entries and restart the vault from scratch (requires explicit confirmation with `--confirm-reset`)
- `--report`: After the cycle, output a human-readable Markdown summary of what changed and why

## Execution Flow

### Step 1: Initialize

1. Load `.hyperagents/vault-state.json` (or initialize if absent).
2. Report the current cycle number, last run timestamp, vault fitness, and open tasks from the previous cycle.
3. If `--focus <domain>` is set, confirm with the user which domain will be targeted before proceeding.

### Step 2: Dispatch the Vault Optimizer Agent

Dispatch the `viva-vault-optimizer` subagent to run one complete optimization cycle:

```
Agent: viva-vault-optimizer
Context:
  - current vault state (from vault-state.json)
  - focus domain (if specified)
  - dry_run flag
  - cycle number override (if specified)
Allowed tools: Read, Write, Edit, Bash, Grep, Glob
```

> **Safety**: Do NOT allow the Agent tool inside the vault optimizer subagent — this prevents recursive agent spawning.

### Step 3: Collect Results

After the optimizer completes:

1. Read the updated `.hyperagents/vault-state.json` to retrieve the new fitness score and accepted/rejected mutation counts.
2. If `--dry-run`, display the projected changes without writing them and exit.
3. If `--report`, generate a Markdown summary (see Report Format below).

### Step 4: Report Cycle Outcome

Always display a concise summary:

```
✓ VIVA Vault Optimization Cycle <n> complete
  Fitness: <prev> → <new> (<delta> <↑|↓|→>)
  Mutations accepted: <count> | rejected: <count>
  Open tasks carried forward: <count>
  Next scheduled run: <timestamp>
  Lowest-health domain: <domain> (<score>)
```

If fitness degraded by more than 0.02, display a warning and suggest running `/hyperagents:optimize-vault --focus <regressed_domain>` to target the regression.

## Report Format (--report flag)

When `--report` is set, emit a structured Markdown document after the cycle:

```markdown
# VIVA Vault Cycle <n> Report
**Date**: <timestamp>
**Fitness**: <prev> → <new> (<delta>)

## Mutations Accepted (<count>)
- **[<domain>]** `<entry-path>`: <brief description of change> (fitness delta: <+/- value>)
...

## Mutations Rejected (<count>)
- `<entry-path>`: <reason for rejection>
...

## Cross-Domain Links Added
- `<source>` → `<target>`: <relationship type>
...

## External Signals Integrated
- <source>: <insight captured>
...

## Open Tasks for Next Cycle
1. <task description> (domain: <domain>, priority: high|medium|low)
...

## Vault Health by Domain
| Domain       | Health | Entries | Links | Freshness |
|--------------|--------|---------|-------|-----------|
| Vision       | 0.00   | 0       | 0     | 0.00      |
| Insights     | 0.00   | 0       | 0     | 0.00      |
| Verification | 0.00   | 0       | 0     | 0.00      |
| Actions      | 0.00   | 0       | 0     | 0.00      |
```

## Safety Guards

- **Require `--confirm-reset`** alongside `--full-reset` — never reset silently.
- **Timeout**: If the vault optimizer subagent does not return within 8 minutes, mark the cycle as timed out and log to `.hyperagents/vault-timeout.log`.
- **Budget cap**: If the vault optimizer's token usage exceeds $2.00, halt and report. One optimization cycle should never cost more than this.
- **Immutable history**: Never pass write access to `.hyperagents/archive.jsonl` or any `gen_*/` directory to the vault optimizer.

## Related Components

| Component | Role |
|-----------|------|
| `viva-vault-optimizer` agent | Does the actual work — surveys, mutates, evaluates, integrates |
| `vault-improvement` skill | Provides the conceptual framework and fitness formulas |
| Schedule hook (`hooks.json`) | Triggers this flow hourly without user intervention |
| `.hyperagents/vault-state.json` | Persistent state file connecting cycles |
| `.hyperagents/vault-history.jsonl` | Longitudinal record of all cycle outcomes |

## Examples

```bash
# Run one optimization cycle with a full report
/hyperagents:optimize-vault --report

# Preview what the optimizer would do without making changes
/hyperagents:optimize-vault --dry-run

# Focus this cycle on the Insights domain
/hyperagents:optimize-vault --focus insights --report

# Resume from a specific cycle number
/hyperagents:optimize-vault --cycle 12 --resume

# Reset the vault (with explicit confirmation)
/hyperagents:optimize-vault --full-reset --confirm-reset
```
