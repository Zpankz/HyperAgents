---
name: Staged Evaluation
description: "Two-phase evaluation strategy from HyperAgents — run a quick staged check on small samples first, only proceed to full evaluation if the staged eval passes. Saves 90%+ compute on broken mutations. Triggers when evaluating generations, running benchmarks, or optimizing evaluation cost."
version: 1.0.0
metadata:
  filePattern:
    - "**/staged*"
    - "**/*eval*"
    - "**/report.json"
  bashPattern:
    - "staged"
    - "quick.*eval"
    - "fast.*check"
  priority: 60
---

# Staged Evaluation

A key optimization from HyperAgents: don't waste compute evaluating obviously broken mutations. Run a cheap quick check first, and only invest in full evaluation for promising candidates.

## The Problem

Full evaluation is expensive:
- Running a full test suite takes minutes
- LLM-as-judge evaluations cost tokens
- Benchmark suites can take hours
- Most mutations (especially early ones) produce broken or worse code

## The Solution: Two-Phase Evaluation

### Phase 1: Staged Evaluation (Quick Check)

Run on a small sample to detect obvious failures:
- Use 10% of the full sample set, or a fixed small number (e.g., 10 items)
- Timeout aggressively (1/10th of full timeout)
- Score the results

**Decision rule:**
- Score is 0 or null → **FAIL FAST**, skip full evaluation
- Score is non-zero → **PROCEED** to full evaluation

### Phase 2: Full Evaluation

Run on the complete sample set:
- Use all available evaluation items
- Full timeout allowance
- Generate comprehensive report with per-item details

## Implementation

```
function evaluate_generation(genid, domain):
    # Phase 1: Staged
    staged_samples = get_staged_sample_count(domain)  # e.g., 10
    staged_score = run_evaluation(genid, domain, samples=staged_samples)

    if staged_score is None or staged_score <= 0:
        mark_generation_as_failed(genid)
        return  # FAIL FAST

    # Phase 2: Full
    full_score = run_evaluation(genid, domain, samples=-1)  # all samples
    store_score(genid, domain, full_score)
```

## Score Adjustment

When comparing a staged-only generation against fully-evaluated ones, adjust the score:

```
adjusted_score = staged_score * (staged_samples / full_samples)
```

This prevents a generation that only passed 10 easy items from appearing better than one that passed 80 out of 100.

## Configuration

In `.hyperagents/config.json`:
```json
{
  "staged_eval": {
    "enabled": true,
    "threshold": 0,
    "samples": {
      "tests": 10,
      "lint": 5,
      "review": 3,
      "benchmark": 5
    },
    "fractions": {
      "tests": 0.1,
      "lint": 0.1,
      "review": 0.1,
      "benchmark": 0.1
    }
  }
}
```

## When to Skip Staged Evaluation

Use `--skip-staged` flag when:
- You're confident the mutation is valid (e.g., minor prompt tweak)
- The full evaluation is already fast (< 30 seconds)
- You need accurate scores for every generation (research/analysis)
- You're running a final evaluation of the best generation

## Examples

These scenarios illustrate when this skill activates and what it does.

### Scenario 1: Staged eval catches a broken mutation early
**Trigger**: The evolve loop runs staged evaluation on generation 3, which has a syntax error introduced by the meta-agent.
**Action**: The staged eval runs 10 out of 100 test items. All 10 fail because the code does not parse, producing a score of 0. The skill marks generation 3 as failed (`valid_parent: false`) and skips the full 100-item evaluation, saving approximately 90% of the compute cost for this generation. The loop proceeds immediately to generation 4.

### Scenario 2: User skips staged eval for a known-safe change
**Trigger**: User runs `/hyperagents:evolve --skip-staged` because they are making a minor prompt wording adjustment and want accurate full-evaluation scores.
**Action**: The skill bypasses the two-phase pattern and runs the full evaluation directly. No score adjustment is applied since the full sample set is used. This is appropriate when the mutation is low-risk and the user prefers precision over speed.

### Scenario 3: Understanding score adjustment after staged-only evaluation
**Trigger**: User asks "Why does generation 6 show a score of 0.08 when its staged eval was 0.80?"
**Action**: The skill explains the score adjustment formula: `adjusted_score = 0.80 * (10 / 100) = 0.08`. Because generation 6 only passed staged evaluation (the full eval was not run, possibly due to a loop interruption), its raw score of 0.80 is scaled down by the staged-to-full sample ratio. This prevents a generation evaluated on 10 easy items from outcompeting one that passed 80 out of 100 items in a full run.

## Cost Savings

Typical savings in a 20-generation evolution run:
- Without staged eval: 20 full evaluations
- With staged eval: ~5 full evaluations (75% savings)
- Most mutations fail early, especially in the first few generations
