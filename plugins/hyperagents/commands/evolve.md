---
name: evolve
description: "Start or resume a HyperAgents evolutionary improvement loop. Iteratively mutates code/skills/agents, evaluates fitness, and selects parents for the next generation. Use: /hyperagents:evolve [--domain <domain>] [--generations <n>] [--resume]"
allowed-tools: [Read, Write, Edit, Bash, Grep, Glob, Agent]
---

# HyperAgents Evolve Command

You are orchestrating an evolutionary self-improvement loop inspired by Meta's HyperAgents framework. This is the core generate loop — it coordinates the meta-agent, task-agent, evaluation, archive management, and parent selection.

## Arguments

Parse the user's arguments:
- `--domain <domain>`: The evaluation domain (default: infer from project context)
- `--generations <n>`: Maximum generations to run (default: 5)
- `--resume`: Resume from existing archive state
- `--target <path>`: What to evolve (a skill, agent, hook, or code file)
- `--parent-selection <method>`: One of `score_prop`, `random`, `latest`, `best` (default: `score_prop`)
- `--skip-staged`: Skip staged evaluation (go straight to full eval)

## Execution Flow

### Phase 1: Initialize

1. Check for existing archive at `.hyperagents/archive.jsonl` in the project root
2. If `--resume`, load the archive and continue from the last generation
3. If fresh start:
   - Create `.hyperagents/` directory structure
   - Record the current git commit as `root_commit`
   - Create `gen_initial/` with baseline evaluation
   - Initialize `archive.jsonl` with the initial node

### Phase 2: Generate Loop

For each generation from `start` to `max_generation`:

1. **Select Parent**: Use the parent selection method to pick an ancestor from the archive
2. **Create Worktree**: Launch a git worktree for isolated mutation (`hyperagents/gen_<id>`)
3. **Run Meta-Agent**: Dispatch the `meta-agent` subagent in the worktree with:
   - The target file(s) to improve
   - Previous evaluation results from the archive
   - The number of remaining iterations
4. **Capture Diff**: Record the meta-agent's changes as a patch file
5. **Staged Evaluation**: Run quick fitness check on a small sample
   - If score is 0 or null, skip full evaluation (saves cost)
6. **Full Evaluation**: If staged eval passes, run complete fitness evaluation
7. **Update Archive**: Append the new generation to `archive.jsonl` with metadata
8. **Cleanup**: Remove the worktree, keep the patch and results

### Phase 3: Report

After all generations complete:
1. Display a progress summary showing fitness over generations
2. Highlight the best generation and its improvements
3. Show the diff of the best generation vs the initial state
4. Suggest applying the best generation's changes to the main branch

## Archive Structure

Each generation in `.hyperagents/archive.jsonl` is a JSON line:
```json
{
  "genid": 3,
  "parent_genid": 1,
  "timestamp": "2026-03-25T10:30:00Z",
  "patch_file": ".hyperagents/gen_3/model_patch.diff",
  "fitness_scores": {"accuracy": 0.85, "quality": 0.72},
  "valid_parent": true,
  "meta_agent_success": true,
  "run_full_eval": true
}
```

## Safety Guards

Before and during the evolution loop, enforce these constraints to prevent runaway execution and excessive cost:

### Hard Generation Limit

- The `--generations` flag sets the requested count, but the **absolute hard limit is 20 generations** regardless of user input. If `--generations` exceeds 20, clamp it to 20 and warn the user.
- Track cumulative generations across `--resume` runs. If the archive already contains 20+ generations, refuse to start and suggest analyzing existing results instead.

### Per-Generation Timeout

- Each generation (meta-agent dispatch + evaluation) has a **10-minute wall-clock timeout**. If a generation exceeds this, kill the meta-agent subprocess, record the generation as `meta_agent_success: false`, and move to the next generation.
- Log the timeout event to `generate.log` with the elapsed time.

### Cost Estimation and Budget

Before starting the loop, estimate total cost and present it to the user:

1. **Estimate per-generation cost** based on the model used (e.g., opus = ~$0.50-2.00/generation, sonnet = ~$0.10-0.50/generation depending on task complexity)
2. **Display projected total**: `estimated_per_gen * num_generations`
3. **Require explicit confirmation** if projected total exceeds $5.00
4. Track cumulative token usage per generation in the archive metadata:
   ```json
   {
     "genid": 3,
     "token_usage": {"input": 45000, "output": 12000, "cache_read": 30000},
     "estimated_cost_usd": 0.85
   }
   ```
5. **Halt the loop** if cumulative cost across all generations exceeds **$20.00** (configurable via `max_budget_usd` in `.hyperagents/config.json`)

### Allowed Tools Restriction

When dispatching the meta-agent, restrict available tools to the minimum required set:
- **Always allowed**: Read, Write, Edit, Bash, Grep, Glob
- **Never allowed**: Agent (prevents recursive agent spawning from within the meta-agent), TodoWrite
- Pass the tool restriction via the `allowed-tools` parameter when dispatching the subagent

### Abort Conditions

Stop the evolution loop immediately if any of these occur:
- 3 consecutive generations fail (all marked `meta_agent_success: false`)
- 3 consecutive generations score lower than the parent they were derived from
- The meta-agent attempts to modify files outside the worktree boundary
- Cumulative cost exceeds the budget limit

When aborting, log the reason to `.hyperagents/abort.log` and present a summary to the user.

## Key Principles

- **Sandboxed mutation**: All changes happen in git worktrees, never on the main branch
- **Immutable archive**: Never modify past generations, only append new ones
- **Fail-safe**: If a generation fails, mark it as invalid parent and continue
- **Observable**: Log every step to `.hyperagents/gen_<id>/generate.log`
- **Deterministic replay**: Store enough metadata to reproduce any generation

## Agent Dispatch

Use the Agent tool to dispatch subagents:
- `meta-agent`: For generating code mutations (run in worktree isolation)
- `evaluator`: For fitness evaluation
- `ensemble-agent`: For combining predictions from multiple archive members

Always use `run_in_background: true` for evaluation agents to enable parallelism.

## Related Components

The evolve command orchestrates several agents, skills, and hooks during execution. This section maps which components are involved at each phase.

### Agents

| Agent | Phase | Purpose |
|-------|-------|---------|
| `meta-agent` | Generate Loop (step 3) | Dispatched in the git worktree to produce code mutations against the target files |
| `evaluator` | Staged + Full Evaluation (steps 5-6) | Runs the domain harness and computes fitness scores for each generation |
| `ensemble-agent` | Report (optional) | Combines predictions from multiple archive members when `can_ensemble` is enabled |
| `task-agent` | Within harness | The agent being evolved; invoked by the evaluator harness on each task item |

### Skills

| Skill | When Used |
|-------|-----------|
| `self-improve` | Overall orchestration pattern; the evolve loop is the primary implementation of self-referential improvement |
| `parent-selection` | Generate Loop (step 1); selects which archived generation to mutate next |
| `staged-eval` | Generate Loop (step 5); decides whether to fail fast or proceed to full evaluation |
| `fitness-eval` | Generate Loop (steps 5-6); defines the harness interface, scoring contracts, and multi-domain aggregation |
| `domain-harness` | Generate Loop (steps 5-6); domain-specific task loading, agent invocation, and prediction collection |
| `evolutionary-archive` | Generate Loop (steps 7-8) and Initialize; manages append-only archive, metadata, and lineage tracking |

### Hooks

| Hook | Type | When Fired |
|------|------|------------|
| `track-generation.sh` | PostToolUse (Write/Edit) | After any file write or edit within the meta-agent worktree; tracks which files were modified |
| `archive-snapshot.sh` | Stop | When a session ends; ensures the archive is in a consistent state with a final snapshot |
| `detect-evolution-state.sh` | SessionStart | On session startup or resume; detects whether an evolution run is in progress and loads context |
