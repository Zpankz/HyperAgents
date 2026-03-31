#!/bin/bash
# HyperAgents: Hourly VIVA vault recursive optimization trigger
# Schedule hook — fires on cron "0 * * * *" (top of every hour)
#
# Checks whether the vault is initialized and not already mid-cycle,
# then emits a context message that causes Claude Code to dispatch
# the viva-vault-optimizer agent for one full optimization cycle.

set -euo pipefail

HYPERAGENTS_DIR=".hyperagents"
VAULT_STATE="${HYPERAGENTS_DIR}/vault-state.json"
VAULT_LOCK="${HYPERAGENTS_DIR}/.vault-cycle-active"
VAULT_LOG="${HYPERAGENTS_DIR}/vault-scheduler.log"

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Ensure the .hyperagents directory exists (vault may not be initialized yet)
mkdir -p "$HYPERAGENTS_DIR"

# Guard: don't start a new cycle if a previous one is still running
if [ -f "$VAULT_LOCK" ]; then
  LOCK_AGE_SECONDS=$(( $(date +%s) - $(date -r "$VAULT_LOCK" +%s 2>/dev/null || echo "0") ))
  if [ "$LOCK_AGE_SECONDS" -lt 480 ]; then
    echo "HyperAgents vault optimizer: skipping scheduled run — previous cycle still active (${LOCK_AGE_SECONDS}s elapsed)." >&2
    exit 0
  else
    # Lock is stale (> 8 min old) — clean it up and proceed
    rm -f "$VAULT_LOCK"
    echo "[${TIMESTAMP}] WARN: Removed stale vault cycle lock (age ${LOCK_AGE_SECONDS}s)" >> "$VAULT_LOG"
  fi
fi

# Read current vault state for context
CURRENT_CYCLE=0
CURRENT_FITNESS="uninitialized"
LAST_TS="never"

if [ -f "$VAULT_STATE" ]; then
  if command -v jq >/dev/null 2>&1; then
    CURRENT_CYCLE=$(jq -r '.cycle // 0' "$VAULT_STATE" 2>/dev/null || echo "0")
    CURRENT_FITNESS=$(jq -r '.fitness // "uninitialized"' "$VAULT_STATE" 2>/dev/null || echo "uninitialized")
    LAST_TS=$(jq -r '.last_cycle_ts // "never"' "$VAULT_STATE" 2>/dev/null || echo "never")
  fi
fi

# Create lock file to prevent concurrent runs
touch "$VAULT_LOCK"

# Log the scheduled trigger
echo "[${TIMESTAMP}] Scheduled vault optimization triggered (cycle ${CURRENT_CYCLE}, fitness ${CURRENT_FITNESS})" >> "$VAULT_LOG"

# Prune log entries older than 30 days to prevent unbounded growth
if command -v find >/dev/null 2>&1; then
  # Keep only recent log content (last 1000 lines) as a rolling buffer
  if [ -f "$VAULT_LOG" ]; then
    LOG_LINES=$(wc -l < "$VAULT_LOG" | tr -d ' ')
    if [ "${LOG_LINES:-0}" -gt 1000 ] 2>/dev/null; then
      tail -500 "$VAULT_LOG" > "${VAULT_LOG}.tmp" && mv "${VAULT_LOG}.tmp" "$VAULT_LOG"
    fi
  fi
fi

# Emit context injection for Claude Code — this message causes Claude to
# dispatch the viva-vault-optimizer agent for one optimization cycle.
echo "HyperAgents scheduled vault optimization: starting cycle ${CURRENT_CYCLE} (last run: ${LAST_TS}, fitness: ${CURRENT_FITNESS}). Dispatching viva-vault-optimizer for one full VIVA vault improvement cycle — survey all domains, generate and evaluate mutations, integrate external signals, and persist results to .hyperagents/vault-state.json."
