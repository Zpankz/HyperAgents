#!/bin/bash
# HyperAgents: Snapshot archive state on session end
# Stop hook — fires when a Claude Code session ends
#
# Captures the final state of the archive and any uncommitted
# changes to the evolution tracking files. This ensures continuity
# across sessions.

set -euo pipefail

HYPERAGENTS_DIR=".hyperagents"

# Only run if hyperagents is initialized
if [ ! -d "$HYPERAGENTS_DIR" ]; then
  exit 0
fi

# Create session snapshot
SNAPSHOT_DIR="${HYPERAGENTS_DIR}/snapshots"
mkdir -p "$SNAPSHOT_DIR"

TIMESTAMP=$(date -u +"%Y%m%d_%H%M%S")
SNAPSHOT_FILE="${SNAPSHOT_DIR}/session_${TIMESTAMP}.json"

# Gather state
ARCHIVE_SIZE=0
BEST_SCORE="N/A"
LATEST_GEN="N/A"

if [ -f "${HYPERAGENTS_DIR}/archive.jsonl" ]; then
  ARCHIVE_SIZE=$(wc -l < "${HYPERAGENTS_DIR}/archive.jsonl" | tr -d ' ')
  LATEST_LINE=$(tail -1 "${HYPERAGENTS_DIR}/archive.jsonl")
  LATEST_GEN=$(echo "$LATEST_LINE" | jq -r '.current_genid // "N/A"' 2>/dev/null || echo "N/A")
fi

# Write snapshot
cat > "$SNAPSHOT_FILE" << EOF
{
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "archive_generations": $ARCHIVE_SIZE,
  "latest_generation": "$LATEST_GEN",
  "session_type": "stop"
}
EOF

# --- Size limit check: warn if .hyperagents/ exceeds 100MB ---
MAX_SIZE_MB=100
if command -v du >/dev/null 2>&1; then
  # du -sm gives size in MB (POSIX-compatible with GNU/BSD coreutils)
  DIR_SIZE_MB=$(du -sm "$HYPERAGENTS_DIR" 2>/dev/null | cut -f1 || echo "0")
  if [ "${DIR_SIZE_MB:-0}" -ge "$MAX_SIZE_MB" ] 2>/dev/null; then
    echo "WARNING: ${HYPERAGENTS_DIR}/ is ${DIR_SIZE_MB}MB (exceeds ${MAX_SIZE_MB}MB limit)." >&2
    echo "Consider running archive-manager.sh validate and pruning old generations." >&2
  fi
fi

# --- Prune snapshots older than 7 days to prevent disk bloat ---
if [ -d "$SNAPSHOT_DIR" ]; then
  find "$SNAPSHOT_DIR" -name 'session_*.json' -type f -mtime +7 -delete 2>/dev/null || true
fi

# Clean up active evolution marker if present
rm -f "${HYPERAGENTS_DIR}/.evolution_active"
rm -f "${HYPERAGENTS_DIR}/current_generation_edits.jsonl"
