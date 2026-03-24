#!/bin/bash
# HyperAgents: Track file modifications during evolution
# PostToolUse hook — fires after Write/Edit operations
#
# When an evolution loop is active, this hook records which files
# are being modified by the meta-agent. This data feeds into the
# archive metadata and helps analyze what kinds of changes improve fitness.

set -euo pipefail

HYPERAGENTS_DIR=".hyperagents"
TRACKING_FILE="${HYPERAGENTS_DIR}/current_generation_edits.jsonl"

# Only track if evolution is active
if [ ! -f "${HYPERAGENTS_DIR}/.evolution_active" ]; then
  exit 0
fi

# Read tool input from stdin (hook protocol)
INPUT=$(cat)

# Detect whether jq is available; define extraction helpers accordingly
if command -v jq >/dev/null 2>&1; then
  _json_extract() {
    # Usage: _json_extract <json_string> <jq_expression> [default]
    local result
    result=$(printf '%s' "$1" | jq -r "$2" 2>/dev/null) || true
    if [ -z "$result" ] || [ "$result" = "null" ]; then
      printf '%s' "${3:-}"
    else
      printf '%s' "$result"
    fi
  }
else
  # Fallback: lightweight JSON value extraction using grep/sed.
  # Handles simple flat keys (no nested paths). Sufficient for the
  # hook protocol's single-level tool_input and tool_name fields.
  _json_extract_key() {
    # Usage: _json_extract_key <json_string> <key> [default]
    local result
    result=$(printf '%s' "$1" | sed -n 's/.*"'"$2"'"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1)
    if [ -z "$result" ]; then
      printf '%s' "${3:-}"
    else
      printf '%s' "$result"
    fi
  }
  _json_extract() {
    # Map jq-style expressions to the grep/sed fallback.
    # Supports the two patterns used in this script:
    #   .tool_input.file_path // .tool_input.path // empty
    #   .tool_name // "unknown"
    local json="$1" expr="$2" default="${3:-}"
    case "$expr" in
      *tool_input.file_path*tool_input.path*)
        local val
        val=$(_json_extract_key "$json" "file_path")
        if [ -z "$val" ]; then
          val=$(_json_extract_key "$json" "path")
        fi
        printf '%s' "${val:-$default}"
        ;;
      *tool_name*)
        printf '%s' "$(_json_extract_key "$json" "tool_name" "${default:-unknown}")"
        ;;
      *)
        printf '%s' "$default"
        ;;
    esac
  }
fi

# Extract the file path from the tool input
FILE_PATH=$(_json_extract "$INPUT" '.tool_input.file_path // .tool_input.path // empty')

if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Record the edit
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
TOOL_NAME=$(_json_extract "$INPUT" '.tool_name // "unknown"' "unknown")

echo "{\"timestamp\":\"${TIMESTAMP}\",\"tool\":\"${TOOL_NAME}\",\"file\":\"${FILE_PATH}\"}" >> "$TRACKING_FILE"
