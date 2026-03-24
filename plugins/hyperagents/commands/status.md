---
name: status
description: "Show the current state of the HyperAgents evolution process — active generation, archive health, fitness trajectory, and next steps. Use: /hyperagents:status"
allowed-tools: [Read, Bash, Glob]
---

# HyperAgents Status Command

Display a comprehensive status report of the evolutionary improvement process.

## Execution

1. **Check initialization**: Verify `.hyperagents/` directory exists
   - If not, tell user to run `/hyperagents:evolve` first

2. **Load archive**: Read `.hyperagents/archive.jsonl`
   - Count total generations
   - Count valid parents
   - Find best generation and its fitness

3. **Display summary table**:
   ```
   HyperAgents Evolution Status
   ────────────────────────────────────
   Generations:     12 / 20
   Valid parents:   9 (75%)
   Best fitness:    0.87 (gen_7)
   Current parent:  gen_7
   Root commit:     abc1234
   Domain(s):       tests, review
   Selection:       score_prop
   ────────────────────────────────────
   ```

4. **Fitness trajectory**: Show last 5 generations with trend
   ```
   gen_8:  0.72 ▼
   gen_9:  0.78 ▲
   gen_10: 0.81 ▲
   gen_11: 0.79 ▼
   gen_12: 0.85 ▲ (latest)
   ```

5. **Next action**: Suggest what to do next based on state:
   - If evolution is in progress: "Run `/hyperagents:evolve --resume` to continue"
   - If max generations reached: "Run `/hyperagents:archive best` to see the winner"
   - If all recent generations are invalid: "Consider changing parent selection or domain"

6. **Disk usage**: Show size of `.hyperagents/` directory

## Data Sources

The status command reads several files to assemble its report. This section documents exactly which files are consulted and what data is extracted from each.

| File | Data Extracted |
|------|---------------|
| `.hyperagents/archive.jsonl` | Total generation count, list of all genids, and the full archive timeline. Each JSON line contains `current_genid` and the cumulative `archive` array. The last complete line is treated as the source of truth. |
| `.hyperagents/config.json` | Evolution configuration: active domain(s), parent selection method (`selection_method`), generation limits, budget settings (`max_budget_usd`), and staged eval parameters. |
| `.hyperagents/next_parent.json` | The pre-computed next parent selection, showing which genid will be used as the parent for the next generation if the loop resumes. |
| `.hyperagents/gen_<id>/metadata.json` | Per-generation metadata: `parent_genid` (lineage), `parent_agent_success`, `valid_parent`, `run_full_eval`, `optimize_option`, and token usage. Used to count valid parents and detect failed generations. |
| `.hyperagents/gen_<id>/<domain>_eval/report.json` | Fitness scores for each generation per domain. The `score_key` (defined in `config.json`) is read from this file to build the fitness trajectory and identify the best generation. |
| `.hyperagents/abort.log` | If present, indicates the evolution loop was halted early. Contains the abort reason (e.g., consecutive failures, budget exceeded), which is surfaced in the status report. |

### File Access Pattern

The status command performs read-only access. It never modifies any file in `.hyperagents/`. The typical access sequence is:

1. Check `.hyperagents/` directory exists (fail fast if not initialized)
2. Read `archive.jsonl` (last line) to get the list of all genids
3. Read `config.json` for domain names and selection method
4. For each genid in the archive, read `metadata.json` and `report.json`
5. Optionally read `next_parent.json` and `abort.log` if they exist
6. Compute disk usage of the `.hyperagents/` directory via `du -sh`
