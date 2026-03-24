---
name: Fitness Evaluation Framework
description: "Domain-agnostic fitness evaluation for evolved code generations. Defines evaluation harness interfaces, scoring contracts, and multi-domain aggregation. Triggers when evaluating code quality, running benchmarks, or scoring agent outputs."
version: 1.0.0
metadata:
  filePattern:
    - "**/report.json"
    - "**/predictions.csv"
    - "**/*_eval/**"
    - "**/*harness*"
    - "**/*benchmark*"
  bashPattern:
    - "evaluate"
    - "fitness"
    - "score"
    - "benchmark"
  priority: 75
---

# Fitness Evaluation Framework

This skill implements HyperAgents' domain-agnostic evaluation pattern — a pluggable harness system that scores any code generation against configurable fitness criteria.

## Evaluation Harness Interface

Every domain evaluation must implement three operations:

### 1. Harness (Run)
Execute the agent on a set of tasks and collect predictions.

**Interface**:
```
harness(task_list, agent_path, output_dir, num_samples, num_workers) -> predictions
```

**Output**: `predictions.csv` with columns `question_id, prediction`

### 2. Report (Score)
Aggregate predictions into a fitness score.

**Interface**:
```
report(output_dir) -> report.json
```

**Output**: `report.json` with at minimum a score key (domain-specific name)

### 3. Score Key
The JSON field name in report.json that contains the primary fitness metric.

## Built-in Domain Types

### `tests` — Test Suite Fitness
```bash
# Fitness = test pass rate
score = tests_passed / tests_total
```

Config in `.hyperagents/config.json`:
```json
{
  "domain": "tests",
  "test_command": "npm test -- --json",
  "score_key": "pass_rate"
}
```

### `lint` — Code Quality Fitness
```bash
# Fitness = reduction in lint issues vs baseline
score = 1 - (current_issues / baseline_issues)
```

### `typecheck` — Type Safety Fitness
```bash
# Fitness = reduction in type errors vs baseline
score = 1 - (current_errors / baseline_errors)
```

### `benchmark` — Performance Fitness
```bash
# Fitness = custom benchmark metric
score = run_benchmark() / baseline_score
```

### `review` — LLM-as-Judge Fitness
A secondary LLM evaluates the code diff for:
- Correctness (does it do what it claims?)
- Quality (is it well-written?)
- Safety (does it introduce vulnerabilities?)
- Improvement (is it better than the parent?)

Score = weighted average of these criteria.

### `composite` — Multi-Metric Fitness
Combine multiple domain evaluators:
```json
{
  "domain": "composite",
  "components": [
    {"domain": "tests", "weight": 0.5},
    {"domain": "lint", "weight": 0.2},
    {"domain": "review", "weight": 0.3}
  ]
}
```

## Staged Evaluation Pattern

HyperAgents uses a two-phase evaluation to save compute:

### Phase 1: Staged (Quick Check)
- Run on 10% of samples or 10 items
- If score is 0 or null: FAIL FAST, skip full eval
- Purpose: Reject obviously broken mutations early

### Phase 2: Full Evaluation
- Only runs if staged eval produces a non-zero score
- Run on all samples
- Generate comprehensive report
- This is the score that goes into the archive

## Multi-Domain Aggregation

When evolving across multiple domains simultaneously:

```
aggregate_fitness = mean(score_domain_1, score_domain_2, ..., score_domain_N)
```

A generation must have valid scores in ALL domains to be a valid parent.

## Score Normalization

All fitness scores must be in the range [0, 1]:
- Test pass rates are already in [0, 1]
- Game scores: normalize by dividing by 100
- Absolute metrics: normalize by baseline value
- Negative metrics (errors): use `1 - (value / baseline)`

## Fitness Score Adjustment

When only staged eval was run (not full eval), the score is adjusted:

```
adjusted_score = raw_score * staged_eval_fraction
```

Where `staged_eval_fraction = staged_samples / full_samples`.

This prevents staged-only generations from appearing artificially competitive in parent selection.

## Examples

These scenarios illustrate when this skill activates and what it does.

### Scenario 1: Running a composite fitness evaluation
**Trigger**: User runs `/hyperagents:evaluate --domain composite` after configuring a composite domain with tests (weight 0.5), lint (weight 0.2), and review (weight 0.3).
**Action**: The skill runs each component evaluator in sequence: the test harness produces a pass rate of 0.90, the lint scorer computes a 0.85 reduction in issues, and the LLM-as-judge review scores the diff at 0.78. The composite score is computed as `0.5*0.90 + 0.2*0.85 + 0.3*0.78 = 0.854`. The result is written to `report.json` with the composite score and per-component breakdowns.

### Scenario 2: Normalizing a non-standard fitness metric
**Trigger**: User creates a custom benchmark domain where raw scores range from 0 to 1000 instead of 0 to 1.
**Action**: The skill detects that the score in `report.json` exceeds 1.0 and warns that all fitness scores must be in the [0, 1] range. It recommends normalizing by dividing by the baseline score (e.g., `score = raw / 1000`) or by using a min-max normalization against the initial generation's baseline. It shows how to add the normalization step to the domain's `report.sh`.

### Scenario 3: Diagnosing why a generation's score is unexpectedly low
**Trigger**: User asks "Generation 5 scored 0.12 but generation 4 scored 0.85. What happened?"
**Action**: The skill reads both `gen_5/report.json` and `gen_4/report.json`, comparing per-item predictions in `predictions.csv`. It identifies which specific tasks regressed, reads the `model_patch.diff` for gen_5 to pinpoint the code change that caused the regression, and suggests reverting the problematic portion of the diff or using gen_4 as the parent for the next generation.
