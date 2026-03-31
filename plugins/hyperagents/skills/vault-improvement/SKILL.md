---
name: VIVA Vault Recursive Improvement
description: "Recursive, iterative improvement of the VIVA vault — a structured knowledge repository of Vision, Insights, Verification, and Actions. Applies HyperAgents' evolutionary selection pattern to knowledge artifacts. Triggers when optimizing knowledge quality, deepening cross-domain interconnections, integrating agent learnings, or running the scheduled vault optimization loop."
version: 1.0.0
metadata:
  filePattern:
    - "**/vault/**"
    - "**/.hyperagents/vault-state.json"
    - "**/.hyperagents/vault-*.json"
    - "**/.hyperagents/vault-*.jsonl"
  bashPattern:
    - "vault"
    - "VIVA"
    - "viva"
    - "optimize-vault"
    - "insight"
  priority: 85
---

# VIVA Vault Recursive Improvement

This skill implements **continuous, compounding improvement** of the VIVA vault — the HyperAgents project's structured knowledge base. It applies the same evolutionary selection principles used for code improvement to knowledge artifacts, treating insights, verifications, vision statements, and action playbooks as mutable entities subject to fitness-driven selection.

## The VIVA Knowledge Architecture

The VIVA vault is structured around four interlocking domains that mirror the full lifecycle of knowledge:

```
┌─────────────────────────────────────────────────────────────────┐
│                         VIVA VAULT                              │
│                                                                  │
│   ┌──────────┐     validates     ┌──────────────┐               │
│   │  VISION  │ ←────────────── │ VERIFICATION │               │
│   │          │                  │              │               │
│   │ Goals,   │ ─────grounds──→ │ Hypotheses   │               │
│   │ Values,  │                  │ tested by    │               │
│   │ Principles│                 │ evidence     │               │
│   └────┬─────┘                  └──────┬───────┘               │
│        │ inspires                      │ informs               │
│        ↓                               ↓                       │
│   ┌──────────┐     operationalizes ┌──────────┐                │
│   │ INSIGHTS │ ──────────────────→ │ ACTIONS  │                │
│   │          │                     │          │                │
│   │ Patterns,│ ←──── learns from── │ Playbooks│                │
│   │ Syntheses│                     │ Procedures│               │
│   └──────────┘                     └──────────┘                │
└─────────────────────────────────────────────────────────────────┘
```

Every link between domains is a signal. A vault with dense, semantically valid cross-domain connections is a vault with high epistemic integrity.

## When This Skill Activates

- The hourly `Schedule` hook fires and dispatches the `viva-vault-optimizer` agent
- User invokes `/hyperagents:optimize-vault`
- A HyperAgents evolutionary cycle completes, producing new insights to integrate
- User asks to "improve knowledge quality", "map connections", or "integrate learnings"
- Vault fitness drops below threshold (automatic recovery trigger)

## The Recursive Improvement Cycle

```
┌──────────────────────────────────────────────────────────────────┐
│                   HOURLY VAULT IMPROVEMENT LOOP                  │
│                                                                   │
│   ┌─────────────────────────────────────────────────┐            │
│   │  0. ORIENT — read previous cycle state          │            │
│   │         ↓                                       │            │
│   │  1. SURVEY — audit vault health per domain      │            │
│   │         ↓                                       │            │
│   │  2. GENERATE — mutate low-health artifacts      │            │
│   │         ↓                                       │            │
│   │  3. EVALUATE — score mutations on fitness fn    │            │
│   │         ↓                                       │            │
│   │  4. INTEGRATE — absorb external signals         │            │
│   │         ↓                                       │            │
│   │  5. ARCHIVE — persist, plan next cycle          │            │
│   │         │                                       │            │
│   │         └──────── feeds next cycle ─────────────┘            │
│   └─────────────────────────────────────────────────┘            │
└──────────────────────────────────────────────────────────────────┘
```

**Recursion**: Each cycle's state file becomes the seed of the next. The vault never resets; it compounds.

## Key Principles

### 1. Knowledge as a Mutable Target
Just as HyperAgents treats code as mutable and improvable, this skill treats knowledge artifacts — insight documents, vision statements, verification records — as first-class mutable entities that can be:
- **Clarified**: Vague language replaced with falsifiable precision
- **Decomposed**: Over-broad claims split into granular sub-claims
- **Synthesized**: Redundant, converging insights merged into composites
- **Cross-linked**: Related entries across domains explicitly connected
- **Retired**: Superseded or falsified entries archived with rationale

### 2. Fitness-Driven Selection
Not every mutation improves the vault. The skill uses a multi-dimensional fitness function:

| Dimension | Weight | What It Measures |
|-----------|--------|-----------------|
| Clarity | 0.25 | Precision and falsifiability of each entry |
| Linkage Density | 0.25 | Cross-domain connection richness |
| Evidence Ratio | 0.20 | Fraction of insights with verification links |
| Action Coverage | 0.15 | Fraction of actions motivated by insights/vision |
| Freshness | 0.15 | Fraction of entries updated in the last 30 days |

Only mutations that improve the composite fitness score (or resolve a flagged issue without degrading others) are accepted.

### 3. Append-Only History
Every cycle appends to `.hyperagents/vault-history.jsonl`. No cycle's output is ever deleted. This enables:
- Regression detection (compare fitness across cycles)
- Knowledge archaeology (recover retired insights if needed)
- Pattern analysis (which mutation types yield the most improvement)

### 4. Integration with HyperAgents Evolutionary Archive
The VIVA vault is not isolated — it actively consumes outputs from the HyperAgents evolution loop:

```
HyperAgents evolution  →  archive.jsonl  →  Vault Integrator  →  /vault/insights/
HyperAgents sessions   →  snapshots/     →  Vault Integrator  →  /vault/actions/
Fitness evaluations    →  gen_*/report.json → Vault Integrator → /vault/verification/
```

This creates a **closed feedback loop**: the vault learns from agent activity, and agents can read the vault for accumulated knowledge.

## Implementation Pattern

When the `viva-vault-optimizer` agent runs one cycle:

```
1. Load .hyperagents/vault-state.json
2. Survey vault domains → vault-survey-<n>.json
3. Select mutation targets (2–4 low-health entries, score_prop weighted)
4. For each target:
   a. Generate 1–3 candidate mutations
   b. Score each mutation on the 5-dimension fitness function
   c. Accept mutations that improve score; reject the rest
   d. Log results to vault-mutations-<n>.jsonl
5. Integrate external signals:
   a. New archive.jsonl entries → insights
   b. Session snapshots → actions
   c. Eval reports → verification
6. Write accepted mutations to vault files
7. Update vault-state.json with new fitness and open tasks
8. Append to vault-history.jsonl
9. If fitness regressed > 0.02, schedule a corrective second pass
```

## Vault Entry Format

Every vault entry is a Markdown file with YAML frontmatter:

```yaml
---
domain: insights
created: 2026-03-31T00:00:00Z
updated: 2026-03-31T00:00:00Z
cycle: 1
confidence: 0.75
evidence: moderate     # strong | moderate | weak | speculative
related:
  - vision/continuous-improvement.md
  - verification/eval-gen5-regression.md
tags: [self-improvement, evolutionary, learning]
---

# <Insight Title>

<Single-sentence falsifiable claim.>

## Evidence

<Supporting observations, references to evaluations, or agent outputs.>

## Implications

<What this insight means for the project's vision, actions, or other insights.>
```

## Interconnection Types

When adding cross-domain links, specify the relationship type:

| Source → Target | Relationship Types |
|----------------|-------------------|
| Vision → Insights | `inspires`, `motivates`, `constrains` |
| Vision → Actions | `operationalizes`, `guides` |
| Insights → Verification | `claims`, `predicts` |
| Insights → Actions | `operationalizes`, `suggests` |
| Verification → Insights | `validates`, `falsifies`, `refines` |
| Verification → Vision | `confirms`, `challenges` |
| Actions → Insights | `produces`, `tests` |
| Actions → Vision | `serves`, `deviates-from` |

## Diagnostics

Signs the vault needs urgent attention:

| Symptom | Diagnosis | Remedy |
|---------|-----------|--------|
| Fitness < 0.3 | Overall vault degradation | Full-pass optimization with `--report` |
| Evidence ratio < 0.2 | Too many unverified insights | Focus `--focus verification` cycle |
| Linkage density < 0.1 | Isolated, siloed knowledge | Run interconnection mapping pass |
| Freshness < 0.1 | Stale, unmaintained vault | Survey for obsolete/redundant entries |
| Action coverage < 0.2 | Unmotivated actions | Link actions to their insight/vision roots |
| Zero mutations in 5 cycles | Over-refined, no room to grow | Introduce new signals; run integration pass |

## Examples

### Scenario 1: Hourly scheduled run integrates new evolutionary data
**Trigger**: The `Schedule` hook fires at the top of the hour, dispatching `viva-vault-optimizer`.
**Action**: The agent reads `.hyperagents/vault-state.json` (cycle 14, fitness 0.68). It surveys all four domains and finds three stale insights and two orphaned actions. It also detects that two new generations were added to `archive.jsonl` since the last cycle, containing a recurring pattern where prompt-specificity improvements yielded fitness gains of 0.12+. The agent creates a new insight `/vault/insights/prompt-specificity-pattern.md` with a cross-link to the relevant verification entry and links two existing actions to it. Vault fitness rises to 0.74. The state file is updated with cycle 15 and two open tasks for the next cycle.

### Scenario 2: Recursive self-correction after fitness regression
**Trigger**: Cycle 22 completes with vault fitness dropping from 0.71 to 0.65 — a delta of -0.06, exceeding the -0.02 threshold.
**Action**: The agent detects the regression in Phase 5, identifies that 3 accepted mutations in the `insights` domain introduced vague language (reducing clarity from 0.80 to 0.62). It immediately initiates a corrective pass restricted to those 3 entries, rewriting them with precise, falsifiable language. After the corrective pass, fitness recovers to 0.72. Both the regression and the recovery are logged in `vault-history.jsonl` as a contiguous pair, annotated with `type: corrective_pass`.

### Scenario 3: User requests a focused verification pass
**Trigger**: User runs `/hyperagents:optimize-vault --focus verification --report`.
**Action**: The command dispatches `viva-vault-optimizer` with a `focus: verification` constraint. The agent surveys only `/vault/verification/` entries, finding 4 hypotheses with no linked insights (orphaned verifications). It cross-links each to the most relevant insight based on semantic similarity, then checks whether any insights in `/vault/insights/` lack any verification link and flags them as `evidence: speculative`. The cycle accepts 6 mutations, rejects 1 (the proposed link was semantically invalid), and raises `evidence_ratio` from 0.38 to 0.61 in one cycle.

## Anti-Patterns to Avoid

- **Goodhart's Vault**: Adding links solely to inflate `linkage_density` without semantic validity
- **Insight Sprawl**: Creating too many fine-grained insights instead of synthesizing; prefer 10 well-linked insights over 50 isolated fragments
- **Verification Theater**: Adding weak anecdotal evidence to claim `evidence: strong`
- **Action Graveyard**: Accumulating retired actions without periodic archival
- **Cycle Inflation**: Running more than one full cycle per hour (defeats the compounding purpose; signals something is broken)
