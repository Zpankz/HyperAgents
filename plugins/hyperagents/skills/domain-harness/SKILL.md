---
name: Domain Evaluation Harness
description: "Create and configure domain-specific evaluation harnesses for the HyperAgents evolution loop. Defines how tasks are loaded, agents are invoked, predictions are collected, and scores are computed. Triggers when setting up evaluation domains or creating custom fitness functions."
version: 1.0.0
metadata:
  filePattern:
    - "**/harness*"
    - "**/domains/**"
    - "**/.hyperagents/domains/**"
  bashPattern:
    - "harness"
    - "domain"
    - "evaluation"
  priority: 65
---

# Domain Evaluation Harness

The harness is the bridge between the HyperAgents evolution loop and domain-specific evaluation. It defines how to load tasks, run the agent, collect predictions, and compute fitness scores.

## Harness Architecture

```
┌──────────────┐     ┌─────────────┐     ┌──────────────┐
│  Task List   │────>│   Harness   │────>│  Predictions │
│  (input)     │     │  (executor) │     │  (output)    │
└──────────────┘     └──────┬──────┘     └──────┬───────┘
                            │                    │
                     ┌──────▼──────┐     ┌──────▼───────┐
                     │ Task Agent  │     │   Reporter   │
                     │ (modified)  │     │  (scorer)    │
                     └─────────────┘     └──────┬───────┘
                                                │
                                         ┌──────▼───────┐
                                         │  report.json │
                                         │  (fitness)   │
                                         └──────────────┘
```

## Creating a Custom Domain

### Step 1: Define the Task Format

Create a task list JSON file with evaluation items:
```json
[
  {
    "question_id": "task_001",
    "input": "Write a function that reverses a string",
    "expected": "def reverse_string(s): return s[::-1]"
  }
]
```

### Step 2: Create the Harness Script

Place at `.hyperagents/domains/<domain>/harness.sh`:

```bash
#!/bin/bash
# Domain harness script
# Args: --task-list <path> --agent-path <path> --output-dir <path> --num-samples <n>

TASK_LIST=$2
AGENT_PATH=$4
OUTPUT_DIR=$6
NUM_SAMPLES=$8

# Load tasks
# Run agent on each task
# Collect predictions
# Write predictions.csv to OUTPUT_DIR
```

### Step 3: Create the Reporter

Place at `.hyperagents/domains/<domain>/report.sh`:

```bash
#!/bin/bash
# Domain reporter script
# Args: --output-dir <path>

OUTPUT_DIR=$2

# Read predictions.csv
# Compare to expected outputs
# Compute score
# Write report.json
```

### Step 4: Register the Domain

Add to `.hyperagents/config.json`:
```json
{
  "domains": {
    "my_domain": {
      "harness": ".hyperagents/domains/my_domain/harness.sh",
      "reporter": ".hyperagents/domains/my_domain/report.sh",
      "score_key": "accuracy",
      "splits": ["train", "val"],
      "can_ensemble": true,
      "staged_eval_fraction": 0.1,
      "staged_eval_samples": 10
    }
  }
}
```

## Built-in Domains for Claude Code

### `claude-skill` — Skill Quality
Evaluates a Claude Code skill by:
1. Loading test prompts that should trigger the skill
2. Running a simulated session with the skill active
3. Scoring the output for relevance, accuracy, and helpfulness

### `claude-agent` — Agent Effectiveness
Evaluates a Claude Code agent by:
1. Loading task descriptions the agent should handle
2. Dispatching the agent on each task
3. Scoring completions for correctness and quality

### `claude-hook` — Hook Reliability
Evaluates a Claude Code hook by:
1. Simulating tool calls that should trigger the hook
2. Checking that the hook fires correctly
3. Measuring false positive/negative rates
4. Scoring execution time

### `code-quality` — General Code Quality
Combines multiple signals:
- Test pass rate
- Lint issue count
- Type error count
- Cyclomatic complexity delta

## Domain Configuration Reference

| Field | Type | Description |
|-------|------|-------------|
| `harness` | string | Path to harness script |
| `reporter` | string | Path to reporter script |
| `score_key` | string | JSON key in report.json for the fitness score |
| `splits` | string[] | Evaluation splits: train, val, test |
| `can_ensemble` | boolean | Whether ensemble evaluation makes sense |
| `staged_eval_fraction` | number | Fraction of samples for staged eval |
| `staged_eval_samples` | number | Absolute number of samples for staged eval |
| `eval_timeout` | number | Timeout in seconds per task |
| `max_workers` | number | Parallel evaluation workers |

## Examples

These scenarios illustrate when this skill activates and what it does.

### Scenario 1: Setting up a custom evaluation domain for a new project
**Trigger**: User says "I want to evolve my data pipeline code. How do I create a harness for it?"
**Action**: The skill walks the user through the four-step domain setup: defining a task list JSON with representative pipeline inputs and expected outputs, writing a `harness.sh` script that feeds each task to the agent and collects predictions, creating a `report.sh` that compares outputs to expectations and computes an accuracy score, and registering the domain in `.hyperagents/config.json` with the appropriate `score_key`, splits, and staged eval settings.

### Scenario 2: Debugging why a domain evaluation returns null scores
**Trigger**: User runs `/hyperagents:evolve --domain my_domain` and the status shows `fitness: null` for every generation.
**Action**: The skill diagnoses common harness failures: the harness script is not executable, the `score_key` in `config.json` does not match the key written by `report.sh`, or the `predictions.csv` format has mismatched column headers. It suggests running the harness manually with `--num-samples 1` to isolate the failure point and inspecting the `report.json` output for the expected score key.

### Scenario 3: Configuring multi-domain evolution
**Trigger**: User says "I want to optimize for both test pass rate and code quality simultaneously."
**Action**: The skill explains how to register multiple domains in `config.json` (e.g., `tests` and `lint`), sets appropriate weights via the `composite` domain type, and notes that aggregate fitness is the mean across domains. It warns that a generation must score non-null on ALL domains to be a valid parent, so each harness must be independently functional before combining them.

## Multi-Domain Evolution

HyperAgents supports evolving against multiple domains simultaneously:
- Each domain runs its own harness and scoring
- The aggregate fitness is the mean across domains
- A generation must score non-null on ALL domains to be valid
- Different domains can have different splits and sample sizes
