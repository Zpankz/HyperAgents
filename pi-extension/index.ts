/**
 * HyperAgents pi Extension
 *
 * Brings self-referential evolutionary self-improvement to pi.
 * Inspired by Meta's HyperAgents paper and the hyperagents-plugin for Claude Code.
 *
 * Commands:
 *   /hyperagents:evolve   — Start or resume an evolutionary improvement loop
 *   /hyperagents:evaluate — Evaluate a generation against fitness criteria
 *   /hyperagents:archive  — View, query, and manage the evolutionary archive
 *   /hyperagents:select-parent — Select next parent with configurable strategy
 *   /hyperagents:status   — Show evolution progress dashboard
 *
 * Tools (callable by LLM):
 *   hyperagents_evolve        — Run the evolutionary loop
 *   hyperagents_evaluate      — Score a generation
 *   hyperagents_archive       — Manage archive
 *   hyperagents_select_parent — Select next parent
 *   hyperagents_status        — Show status
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";
import { Text } from "@mariozechner/pi-tui";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { existsSync } from "node:fs";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ArchiveEntry {
  genid: number | "initial";
  parent_genid: number | "initial" | null;
  timestamp: string;
  patch_file: string | null;
  fitness_scores: Record<string, number> | null;
  valid_parent: boolean;
  meta_agent_success: boolean;
  run_full_eval: boolean;
}

interface HyperAgentsConfig {
  domain: string;
  test_command?: string;
  score_key?: string;
  selection_method?: "random" | "latest" | "best" | "score_prop" | "score_child_prop";
  max_generations?: number;
  staged_eval?: {
    enabled: boolean;
    threshold: number;
    samples: Record<string, number>;
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function readArchive(projectRoot: string): Promise<ArchiveEntry[]> {
  const archivePath = join(projectRoot, ".hyperagents", "archive.jsonl");
  try {
    const content = await readFile(archivePath, "utf8");
    return content
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}

async function appendArchive(projectRoot: string, entry: ArchiveEntry): Promise<void> {
  const archivePath = join(projectRoot, ".hyperagents", "archive.jsonl");
  await mkdir(dirname(archivePath), { recursive: true });
  const line = JSON.stringify(entry) + "\n";
  await writeFile(archivePath, line, { flag: "a" });
}

async function readConfig(projectRoot: string): Promise<HyperAgentsConfig | null> {
  const configPath = join(projectRoot, ".hyperagents", "config.json");
  try {
    const content = await readFile(configPath, "utf8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

async function writeConfig(projectRoot: string, config: HyperAgentsConfig): Promise<void> {
  const configPath = join(projectRoot, ".hyperagents", "config.json");
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, JSON.stringify(config, null, 2) + "\n", "utf8");
}

async function readMetadata(projectRoot: string, genid: number | "initial"): Promise<Record<string, unknown> | null> {
  const metaPath = join(projectRoot, ".hyperagents", `gen_${genid}`, "metadata.json");
  try {
    const content = await readFile(metaPath, "utf8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

async function getFitnessScore(projectRoot: string, genid: number | "initial", domain: string, scoreKey: string): Promise<number | null> {
  const reportPath = join(projectRoot, ".hyperagents", `gen_${genid}`, `${domain}_eval`, "report.json");
  try {
    const content = await readFile(reportPath, "utf8");
    const report = JSON.parse(content);
    return typeof report[scoreKey] === "number" ? report[scoreKey] : null;
  } catch {
    return null;
  }
}

function selectParent(
  archive: ArchiveEntry[],
  method: string,
  scores: Map<string | number, number>
): ArchiveEntry | null {
  const validParents = archive.filter((e) => e.valid_parent && scores.has(e.genid));
  if (validParents.length === 0) return null;

  switch (method) {
    case "random":
      return validParents[Math.floor(Math.random() * validParents.length)];

    case "latest":
      return validParents.reduce((a, b) => {
        const aNum = a.genid === "initial" ? -1 : (a.genid as number);
        const bNum = b.genid === "initial" ? -1 : (b.genid as number);
        return bNum > aNum ? b : a;
      });

    case "best":
      return validParents.reduce((best, e) => {
        return (scores.get(e.genid) ?? 0) > (scores.get(best.genid) ?? 0) ? e : best;
      });

    case "score_child_prop": {
      const childCounts = new Map<string | number, number>();
      for (const e of archive) {
        const p = e.parent_genid;
        if (p !== null) childCounts.set(p, (childCounts.get(p) ?? 0) + 1);
      }
      const weights = validParents.map((e) => {
        const s = scores.get(e.genid) ?? 0;
        const c = childCounts.get(e.genid) ?? 0;
        return s / (1 + c);
      });
      const total = weights.reduce((a, b) => a + b, 0);
      if (total === 0) return validParents[0];
      let rand = Math.random() * total;
      for (let i = 0; i < validParents.length; i++) {
        rand -= weights[i];
        if (rand <= 0) return validParents[i];
      }
      return validParents[validParents.length - 1];
    }

    case "score_prop":
    default: {
      const weights = validParents.map((e) => scores.get(e.genid) ?? 0);
      const total = weights.reduce((a, b) => a + b, 0);
      if (total === 0) return validParents[Math.floor(Math.random() * validParents.length)];
      let rand = Math.random() * total;
      for (let i = 0; i < validParents.length; i++) {
        rand -= weights[i];
        if (rand <= 0) return validParents[i];
      }
      return validParents[validParents.length - 1];
    }
  }
}

function renderFitnessBar(score: number | null): string {
  if (score === null) return "  ──── (no score)";
  const pct = Math.round(score * 20);
  const bar = "█".repeat(pct) + "░".repeat(20 - pct);
  const arrow = score >= 0.7 ? "▲" : score >= 0.4 ? "─" : "▼";
  return `  [${bar}] ${(score * 100).toFixed(1)}% ${arrow}`;
}

function formatStatus(archive: ArchiveEntry[], scores: Map<string | number, number>, config: HyperAgentsConfig | null): string {
  if (archive.length === 0) {
    return "No evolution archive found. Run /hyperagents:evolve to start.";
  }

  const validParents = archive.filter((e) => e.valid_parent);
  const bestEntry = validParents.reduce<ArchiveEntry | null>((best, e) => {
    if (!best) return e;
    return (scores.get(e.genid) ?? 0) > (scores.get(best.genid) ?? 0) ? e : best;
  }, null);

  const lines: string[] = [
    "╔══════════════════════════════════════╗",
    "║   HyperAgents Evolution Status       ║",
    "╠══════════════════════════════════════╣",
    `║  Generations:    ${String(archive.length).padEnd(20)}║`,
    `║  Valid parents:  ${String(validParents.length).padEnd(20)}║`,
    `║  Best fitness:   ${bestEntry ? `${((scores.get(bestEntry.genid) ?? 0) * 100).toFixed(1)}% (gen_${bestEntry.genid})`.padEnd(20) : "N/A".padEnd(20)}║`,
    `║  Domain:         ${String(config?.domain ?? "unknown").padEnd(20)}║`,
    `║  Selection:      ${String(config?.selection_method ?? "score_prop").padEnd(20)}║`,
    "╠══════════════════════════════════════╣",
    "║  Recent Generations:                 ║",
  ];

  const recent = archive.slice(-5);
  for (const entry of recent) {
    const score = scores.get(entry.genid);
    const badge = entry.valid_parent ? "✓" : "✗";
    const genStr = `gen_${entry.genid}`;
    const scoreStr = score !== undefined ? `${(score * 100).toFixed(1)}%` : "n/a";
    lines.push(`║  ${badge} ${genStr.padEnd(12)} ${scoreStr.padEnd(8)}              ║`);
  }

  lines.push("╚══════════════════════════════════════╝");
  return lines.join("\n");
}

// ─── Extension ───────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {

  // ── Session start: restore state ──────────────────────────────────────────

  pi.on("session_start", async (_event, ctx) => {
    const archiveDir = join(ctx.cwd, ".hyperagents");
    if (existsSync(archiveDir)) {
      ctx.ui.setStatus("hyperagents", "⚡ HyperAgents archive detected");
      ctx.ui.notify("HyperAgents evolution archive found — use /hyperagents:status to review", "info");
    }
  });

  // ── /hyperagents:status ───────────────────────────────────────────────────

  pi.registerCommand("hyperagents:status", {
    description: "Show HyperAgents evolution progress dashboard",
    handler: async (_args, ctx) => {
      const archive = await readArchive(ctx.cwd);
      const config = await readConfig(ctx.cwd);
      const domain = config?.domain ?? "tests";
      const scoreKey = config?.score_key ?? "pass_rate";

      const scores = new Map<string | number, number>();
      for (const entry of archive) {
        const s = await getFitnessScore(ctx.cwd, entry.genid, domain, scoreKey);
        if (s !== null) scores.set(entry.genid, s);
      }

      const summary = formatStatus(archive, scores, config);
      ctx.ui.notify(summary, "info");
    },
  });

  // ── /hyperagents:archive ──────────────────────────────────────────────────

  pi.registerCommand("hyperagents:archive", {
    description: "View, query, and manage the evolutionary archive (subcommands: show, best, lineage <genid>, prune, export)",
    handler: async (args, ctx) => {
      const parts = (args ?? "show").trim().split(/\s+/);
      const subcommand = parts[0] ?? "show";
      const archive = await readArchive(ctx.cwd);
      const config = await readConfig(ctx.cwd);
      const domain = config?.domain ?? "tests";
      const scoreKey = config?.score_key ?? "pass_rate";

      if (archive.length === 0) {
        ctx.ui.notify("Archive is empty. Run /hyperagents:evolve first.", "warning");
        return;
      }

      const scores = new Map<string | number, number>();
      for (const entry of archive) {
        const s = await getFitnessScore(ctx.cwd, entry.genid, domain, scoreKey);
        if (s !== null) scores.set(entry.genid, s);
      }

      switch (subcommand) {
        case "show": {
          const rows = archive.map((e) => {
            const s = scores.get(e.genid);
            return `gen_${String(e.genid).padEnd(8)} parent:${String(e.parent_genid ?? "—").padEnd(6)} ${renderFitnessBar(s ?? null)} ${e.valid_parent ? "✓" : "✗"} ${e.timestamp}`;
          });
          ctx.ui.notify("Archive:\n" + rows.join("\n"), "info");
          break;
        }

        case "best": {
          const validParents = archive.filter((e) => e.valid_parent && scores.has(e.genid));
          const best = validParents.reduce<ArchiveEntry | null>((b, e) =>
            !b || (scores.get(e.genid) ?? 0) > (scores.get(b.genid) ?? 0) ? e : b
          , null);
          if (!best) {
            ctx.ui.notify("No valid generations with scores found.", "warning");
          } else {
            const score = scores.get(best.genid);
            ctx.ui.notify(
              `Best generation: gen_${best.genid}\n` +
              `Score: ${score !== undefined ? (score * 100).toFixed(1) + "%" : "n/a"}\n` +
              `Parent: gen_${best.parent_genid}\n` +
              `Timestamp: ${best.timestamp}\n` +
              `Patch: ${best.patch_file ?? "none"}\n\n` +
              `Apply with: git apply ${best.patch_file}`,
              "info"
            );
          }
          break;
        }

        case "lineage": {
          const targetId = parts[1];
          if (!targetId) {
            ctx.ui.notify("Usage: /hyperagents:archive lineage <genid>", "warning");
            return;
          }
          const chain: ArchiveEntry[] = [];
          let current: ArchiveEntry | undefined = archive.find((e) => String(e.genid) === targetId);
          while (current) {
            chain.unshift(current);
            if (current.parent_genid === null || current.parent_genid === "initial") break;
            current = archive.find((e) => e.genid === current!.parent_genid);
          }
          const lines = chain.map((e, i) => {
            const indent = "  ".repeat(i);
            const s = scores.get(e.genid);
            return `${indent}└─ gen_${e.genid}${renderFitnessBar(s ?? null)}`;
          });
          ctx.ui.notify("Lineage:\n" + lines.join("\n"), "info");
          break;
        }

        case "export": {
          const validParents = archive.filter((e) => e.valid_parent && scores.has(e.genid));
          const best = validParents.reduce<ArchiveEntry | null>((b, e) =>
            !b || (scores.get(e.genid) ?? 0) > (scores.get(b.genid) ?? 0) ? e : b
          , null);
          if (!best || !best.patch_file) {
            ctx.ui.notify("No best generation with a patch found.", "warning");
            return;
          }
          ctx.ui.notify(`Best patch is at: ${best.patch_file}\n\nApply with:\n  git apply ${best.patch_file}`, "info");
          break;
        }

        default:
          ctx.ui.notify(`Unknown subcommand: ${subcommand}. Try: show, best, lineage <genid>, export`, "warning");
      }
    },
  });

  // ── /hyperagents:select-parent ────────────────────────────────────────────

  pi.registerCommand("hyperagents:select-parent", {
    description: "Select the next parent generation (--method random|latest|best|score_prop|score_child_prop) (--dry-run)",
    handler: async (args, ctx) => {
      const archive = await readArchive(ctx.cwd);
      const config = await readConfig(ctx.cwd);
      const domain = config?.domain ?? "tests";
      const scoreKey = config?.score_key ?? "pass_rate";

      const dryRun = (args ?? "").includes("--dry-run");
      const methodMatch = (args ?? "").match(/--method\s+(\S+)/);
      const method = methodMatch?.[1] ?? config?.selection_method ?? "score_prop";

      if (archive.length === 0) {
        ctx.ui.notify("Archive is empty. Run /hyperagents:evolve first.", "warning");
        return;
      }

      const scores = new Map<string | number, number>();
      for (const entry of archive) {
        const s = await getFitnessScore(ctx.cwd, entry.genid, domain, scoreKey);
        if (s !== null) scores.set(entry.genid, s);
      }

      if (dryRun) {
        const validParents = archive.filter((e) => e.valid_parent && scores.has(e.genid));
        const total = [...scores.values()].reduce((a, b) => a + b, 0);
        const rows = validParents.map((e) => {
          const s = scores.get(e.genid) ?? 0;
          const prob = total > 0 ? (s / total * 100).toFixed(1) + "%" : "equal";
          return `gen_${e.genid}: score=${(s * 100).toFixed(1)}% prob=${prob}`;
        });
        ctx.ui.notify(`Selection probabilities (method: ${method}):\n${rows.join("\n")}`, "info");
        return;
      }

      const selected = selectParent(archive, method, scores);
      if (!selected) {
        ctx.ui.notify("No valid parents found in the archive.", "warning");
        return;
      }

      // Persist to next_parent.json
      const nextParentPath = join(ctx.cwd, ".hyperagents", "next_parent.json");
      await writeFile(
        nextParentPath,
        JSON.stringify({ selected_parent: selected.genid, method, parent_fitness: scores.get(selected.genid) ?? null }, null, 2),
        "utf8"
      );

      ctx.ui.notify(
        `Selected parent: gen_${selected.genid}\nMethod: ${method}\nFitness: ${((scores.get(selected.genid) ?? 0) * 100).toFixed(1)}%`,
        "info"
      );
    },
  });

  // ── /hyperagents:evaluate ─────────────────────────────────────────────────

  pi.registerCommand("hyperagents:evaluate", {
    description: "Evaluate a generation against fitness criteria. Use: /hyperagents:evaluate [--genid <id>] [--domain <domain>] [--staged]",
    handler: async (args, ctx) => {
      const genidMatch = (args ?? "").match(/--genid\s+(\S+)/);
      const domainMatch = (args ?? "").match(/--domain\s+(\S+)/);
      const staged = (args ?? "").includes("--staged");

      const config = await readConfig(ctx.cwd);
      const domain = domainMatch?.[1] ?? config?.domain ?? "tests";
      const scoreKey = config?.score_key ?? "pass_rate";
      const genid = genidMatch?.[1] ?? "current";

      ctx.ui.notify(
        `Evaluating gen_${genid} on domain "${domain}" (${staged ? "staged" : "full"} eval)...\n\n` +
        `The LLM will now run the evaluation harness. Provide your fitness criteria and the evaluation will be scored.\n\n` +
        `Domain: ${domain}\nScore key: ${scoreKey}\nOutput dir: .hyperagents/gen_${genid}/${domain}_eval/\n\n` +
        `The evaluator will:\n` +
        `1. ${staged ? "Run quick staged check (10 items/10%)" : "Run full evaluation"}\n` +
        `2. Write report.json with the ${scoreKey} field\n` +
        `3. Update the archive if genid is specified`,
        "info"
      );
    },
  });

  // ── /hyperagents:evolve ───────────────────────────────────────────────────

  pi.registerCommand("hyperagents:evolve", {
    description: "Start or resume a HyperAgents evolutionary improvement loop. Use: /hyperagents:evolve [--domain <domain>] [--generations <n>] [--resume] [--target <path>]",
    handler: async (args, ctx) => {
      const resumeFlag = (args ?? "").includes("--resume");
      const skipStagedFlag = (args ?? "").includes("--skip-staged");
      const generationsMatch = (args ?? "").match(/--generations\s+(\d+)/);
      const domainMatch = (args ?? "").match(/--domain\s+(\S+)/);
      const targetMatch = (args ?? "").match(/--target\s+(\S+)/);
      const selectionMatch = (args ?? "").match(/--parent-selection\s+(\S+)/);

      const maxGenerations = generationsMatch ? parseInt(generationsMatch[1]) : 5;
      const domain = domainMatch?.[1] ?? null;
      const target = targetMatch?.[1] ?? null;
      const selectionMethod = selectionMatch?.[1] ?? "score_prop";

      const archiveDir = join(ctx.cwd, ".hyperagents");
      const archiveExists = existsSync(join(archiveDir, "archive.jsonl"));

      if (resumeFlag && !archiveExists) {
        ctx.ui.notify("No archive found to resume from. Starting fresh.", "warning");
      }

      // Determine or infer domain
      let resolvedDomain = domain;
      if (!resolvedDomain) {
        const config = await readConfig(ctx.cwd);
        resolvedDomain = config?.domain ?? null;

        if (!resolvedDomain) {
          // Infer from project
          if (existsSync(join(ctx.cwd, "package.json"))) resolvedDomain = "tests";
          else if (existsSync(join(ctx.cwd, "Cargo.toml"))) resolvedDomain = "tests";
          else if (existsSync(join(ctx.cwd, "pytest.ini")) || existsSync(join(ctx.cwd, "pyproject.toml"))) resolvedDomain = "tests";
          else resolvedDomain = "review";
        }
      }

      // Write / update config
      const existingConfig = await readConfig(ctx.cwd) ?? {} as HyperAgentsConfig;
      const config: HyperAgentsConfig = {
        ...existingConfig,
        domain: resolvedDomain,
        selection_method: selectionMethod as HyperAgentsConfig["selection_method"],
        max_generations: maxGenerations,
      };
      await writeConfig(ctx.cwd, config);

      // Build the evolve prompt injected as user message to LLM
      const archiveSummary = archiveExists
        ? `Resume mode: existing archive detected at .hyperagents/archive.jsonl`
        : `Fresh start: no archive found — initializing`;

      const evolutionPrompt = `
You are orchestrating a HyperAgents evolutionary improvement loop.

## Configuration
- Domain: ${resolvedDomain}
- Max generations: ${maxGenerations}
- Selection method: ${selectionMethod}
- Target: ${target ?? "infer from project"}
- Staged eval: ${skipStagedFlag ? "disabled" : "enabled"}
- ${archiveSummary}

## Your Task

Run the evolutionary improvement loop following this flow:

### Phase 1: Initialize
1. Create \`.hyperagents/\` directory structure if it doesn't exist
2. ${resumeFlag ? "Load existing archive and continue from last generation" : "Create \`gen_initial/\` with baseline evaluation and initialize archive.jsonl"}
3. Record root git commit: \`git rev-parse HEAD\`

### Phase 2: Generate Loop (repeat ${maxGenerations} times)

For each generation:
1. **Select Parent**: From \`.hyperagents/archive.jsonl\` using "${selectionMethod}" strategy
2. **Create Worktree**: \`git worktree add .hyperagents/worktree_gen_N HEAD\`
3. **Run Meta-Agent**: In the worktree, improve the target file(s) based on previous evaluation results
   - Read previous evaluation results to understand what worked
   - Make targeted, focused improvements (one coherent theme per generation)
   - Verify changes compile/parse before finalizing
4. **Capture Diff**: \`git diff HEAD > .hyperagents/gen_N/agent_output/model_patch.diff\`
5. **Staged Evaluation** (unless --skip-staged):
   - Run domain harness on 10 items or 10% of samples
   - If score is 0 or null → mark invalid, continue to next generation
6. **Full Evaluation** (if staged passes):
   - Run complete fitness evaluation
   - Write report to \`.hyperagents/gen_N/${resolvedDomain}_eval/report.json\`
7. **Update Archive**: Append to \`.hyperagents/archive.jsonl\`:
   \`{"genid": N, "parent_genid": P, "timestamp": "...", "patch_file": "...", "fitness_scores": {...}, "valid_parent": true/false, "meta_agent_success": true/false, "run_full_eval": true/false}\`
8. **Cleanup**: \`git worktree remove .hyperagents/worktree_gen_N\`

### Phase 3: Report
After all generations:
1. Show fitness trajectory across generations
2. Identify best generation and its improvements
3. Show diff of best generation vs initial
4. Offer to apply best changes to main branch

### Domain: ${resolvedDomain}

${resolvedDomain === "tests" ? `
For the "tests" domain:
- Run the project test suite (detect: npm test, cargo test, pytest, etc.)
- Score = tests_passed / tests_total
- Score key: "pass_rate"
` : resolvedDomain === "lint" ? `
For the "lint" domain:
- Run linters and count issues
- Score = 1 - (current_issues / baseline_issues)
- Score key: "lint_score"
` : resolvedDomain === "review" ? `
For the "review" domain:
- Use LLM-as-judge evaluation of code quality
- Assess: correctness, quality, safety, improvement over parent
- Score = weighted average in [0,1]
- Score key: "review_score"
` : `
For the "${resolvedDomain}" domain:
- Detect evaluation method from project configuration
- Normalize all scores to [0, 1]
- Write report.json with a consistent score key
`}

### Safety Constraints
- All mutations happen in git worktrees — never modify main branch directly
- Archive is append-only — never modify past entries
- If a generation fails, mark valid_parent=false and continue
- Log all steps to \`.hyperagents/gen_N/generate.log\`

Start now. Report progress after each generation.
`.trim();

      pi.sendUserMessage(evolutionPrompt, { deliverAs: "followUp" });

      ctx.ui.notify(
        `Starting HyperAgents evolution loop\n` +
        `Domain: ${resolvedDomain} | Generations: ${maxGenerations} | Selection: ${selectionMethod}`,
        "info"
      );
    },
  });

  // ─── LLM-callable Tools ───────────────────────────────────────────────────

  pi.registerTool({
    name: "hyperagents_status",
    label: "HyperAgents Status",
    description: "Show the current state of the HyperAgents evolutionary improvement process — active generation, archive health, fitness trajectory, and next steps.",
    promptSnippet: "Show HyperAgents evolution status, archive health, and fitness trajectory",
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      const archive = await readArchive(ctx.cwd);
      const config = await readConfig(ctx.cwd);
      const domain = config?.domain ?? "tests";
      const scoreKey = config?.score_key ?? "pass_rate";

      const scores = new Map<string | number, number>();
      for (const entry of archive) {
        const s = await getFitnessScore(ctx.cwd, entry.genid, domain, scoreKey);
        if (s !== null) scores.set(entry.genid, s);
      }

      const summary = formatStatus(archive, scores, config);
      return { content: [{ type: "text", text: summary }], details: { archive: archive.length, config } };
    },
    renderCall(_args, theme, _context) {
      return new Text(theme.fg("toolTitle", theme.bold("hyperagents_status")), 0, 0);
    },
    renderResult(result, _opts, theme, _context) {
      const details = result.details as { archive?: number } | undefined;
      const text = details?.archive !== undefined
        ? theme.fg("success", `✓ ${details.archive} generation(s) in archive`)
        : theme.fg("muted", "No archive");
      return new Text(text, 0, 0);
    },
  });

  pi.registerTool({
    name: "hyperagents_read_archive",
    label: "HyperAgents Read Archive",
    description: "Read the HyperAgents evolutionary archive and return all generations with their fitness scores and metadata.",
    promptSnippet: "Read HyperAgents archive entries and fitness scores",
    parameters: Type.Object({
      domain: Type.Optional(Type.String({ description: "Evaluation domain (default: from config)" })),
      limit: Type.Optional(Type.Number({ description: "Max entries to return (default: all)" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const archive = await readArchive(ctx.cwd);
      const config = await readConfig(ctx.cwd);
      const domain = params.domain ?? config?.domain ?? "tests";
      const scoreKey = config?.score_key ?? "pass_rate";

      const scores: Record<string, number | null> = {};
      for (const entry of archive) {
        const s = await getFitnessScore(ctx.cwd, entry.genid, domain, scoreKey);
        scores[String(entry.genid)] = s;
      }

      const entries = params.limit ? archive.slice(-params.limit) : archive;
      const lines = entries.map((e) => {
        const s = scores[String(e.genid)];
        return `gen_${e.genid}: parent=${e.parent_genid} valid=${e.valid_parent} score=${s !== null ? (s * 100).toFixed(1) + "%" : "n/a"} ts=${e.timestamp}`;
      });

      return {
        content: [{ type: "text", text: lines.join("\n") || "Archive is empty." }],
        details: { entries, scores },
      };
    },
  });

  pi.registerTool({
    name: "hyperagents_append_archive",
    label: "HyperAgents Append Archive",
    description: "Append a new generation entry to the HyperAgents archive. Call after each mutation cycle.",
    promptSnippet: "Append a new generation to the HyperAgents evolutionary archive",
    parameters: Type.Object({
      genid: Type.Number({ description: "Generation ID" }),
      parent_genid: Type.Union([Type.Number(), Type.Literal("initial"), Type.Null()]),
      patch_file: Type.Union([Type.String(), Type.Null()], { description: "Path to the git diff patch file" }),
      fitness_scores: Type.Union([Type.Record(Type.String(), Type.Number()), Type.Null()], { description: "Domain -> score mapping" }),
      valid_parent: Type.Boolean({ description: "Whether this generation is a valid parent for future mutations" }),
      meta_agent_success: Type.Boolean({ description: "Whether the meta-agent completed successfully" }),
      run_full_eval: Type.Boolean({ description: "Whether full evaluation was run (vs staged-only)" }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const entry: ArchiveEntry = {
        genid: params.genid,
        parent_genid: params.parent_genid,
        timestamp: new Date().toISOString(),
        patch_file: params.patch_file,
        fitness_scores: params.fitness_scores,
        valid_parent: params.valid_parent,
        meta_agent_success: params.meta_agent_success,
        run_full_eval: params.run_full_eval,
      };
      await appendArchive(ctx.cwd, entry);
      return {
        content: [{ type: "text", text: `Appended gen_${params.genid} to archive. valid_parent=${params.valid_parent}` }],
        details: entry,
      };
    },
  });

  pi.registerTool({
    name: "hyperagents_select_parent",
    label: "HyperAgents Select Parent",
    description: "Select the next parent generation from the archive using configurable selection strategies.",
    promptSnippet: "Select next parent for evolutionary mutation using fitness-based selection",
    parameters: Type.Object({
      method: StringEnum(["random", "latest", "best", "score_prop", "score_child_prop"] as const),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const archive = await readArchive(ctx.cwd);
      const config = await readConfig(ctx.cwd);
      const domain = config?.domain ?? "tests";
      const scoreKey = config?.score_key ?? "pass_rate";

      const scores = new Map<string | number, number>();
      for (const entry of archive) {
        const s = await getFitnessScore(ctx.cwd, entry.genid, domain, scoreKey);
        if (s !== null) scores.set(entry.genid, s);
      }

      const selected = selectParent(archive, params.method, scores);
      if (!selected) {
        throw new Error("No valid parent found in archive. Ensure at least one generation has valid_parent=true and a fitness score.");
      }

      const score = scores.get(selected.genid);
      const result = {
        selected_parent: selected.genid,
        method: params.method,
        parent_fitness: score ?? null,
      };

      const nextParentPath = join(ctx.cwd, ".hyperagents", "next_parent.json");
      await writeFile(nextParentPath, JSON.stringify(result, null, 2), "utf8");

      return {
        content: [{ type: "text", text: `Selected parent: gen_${selected.genid} (fitness: ${score !== undefined ? (score * 100).toFixed(1) + "%" : "n/a"})` }],
        details: result,
      };
    },
    renderCall(args, theme, _context) {
      return new Text(
        theme.fg("toolTitle", theme.bold("hyperagents_select_parent ")) + theme.fg("muted", args.method ?? ""),
        0, 0
      );
    },
    renderResult(result, _opts, theme, _context) {
      const details = result.details as { selected_parent?: number; parent_fitness?: number | null } | undefined;
      if (details?.selected_parent !== undefined) {
        const score = details.parent_fitness !== null ? ` (${((details.parent_fitness ?? 0) * 100).toFixed(1)}%)` : "";
        return new Text(theme.fg("success", `✓ Selected gen_${details.selected_parent}${score}`), 0, 0);
      }
      return new Text(theme.fg("error", "✗ No valid parent found"), 0, 0);
    },
  });

  pi.registerTool({
    name: "hyperagents_read_config",
    label: "HyperAgents Read Config",
    description: "Read the HyperAgents evolution configuration from .hyperagents/config.json.",
    promptSnippet: "Read HyperAgents configuration",
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      const config = await readConfig(ctx.cwd);
      if (!config) {
        return { content: [{ type: "text", text: "No config found at .hyperagents/config.json" }], details: {} };
      }
      return {
        content: [{ type: "text", text: JSON.stringify(config, null, 2) }],
        details: config,
      };
    },
  });

  pi.registerTool({
    name: "hyperagents_write_config",
    label: "HyperAgents Write Config",
    description: "Write or update the HyperAgents evolution configuration.",
    promptSnippet: "Write HyperAgents configuration to .hyperagents/config.json",
    parameters: Type.Object({
      domain: Type.String({ description: "Evaluation domain: tests, lint, typecheck, benchmark, review, composite" }),
      score_key: Type.Optional(Type.String({ description: "JSON key in report.json for the fitness score" })),
      selection_method: Type.Optional(StringEnum(["random", "latest", "best", "score_prop", "score_child_prop"] as const)),
      max_generations: Type.Optional(Type.Number()),
      test_command: Type.Optional(Type.String({ description: "Test command to run for the 'tests' domain" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const existing = await readConfig(ctx.cwd) ?? {} as HyperAgentsConfig;
      const config: HyperAgentsConfig = {
        ...existing,
        domain: params.domain,
        ...(params.score_key ? { score_key: params.score_key } : {}),
        ...(params.selection_method ? { selection_method: params.selection_method as HyperAgentsConfig["selection_method"] } : {}),
        ...(params.max_generations ? { max_generations: params.max_generations } : {}),
        ...(params.test_command ? { test_command: params.test_command } : {}),
      };
      await writeConfig(ctx.cwd, config);
      return {
        content: [{ type: "text", text: `Config written to .hyperagents/config.json` }],
        details: config,
      };
    },
  });

  // ── Session shutdown: snapshot state ──────────────────────────────────────

  pi.on("session_shutdown", async (_event, ctx) => {
    const archiveDir = join(ctx.cwd, ".hyperagents");
    if (existsSync(archiveDir)) {
      // Write a snapshot timestamp
      const snapshotPath = join(archiveDir, "last_session.json");
      await writeFile(
        snapshotPath,
        JSON.stringify({ timestamp: new Date().toISOString(), cwd: ctx.cwd }, null, 2),
        "utf8"
      ).catch(() => {});
    }
  });

  // ── system prompt injection ───────────────────────────────────────────────

  pi.on("before_agent_start", async (event, ctx) => {
    const archiveDir = join(ctx.cwd, ".hyperagents");
    if (!existsSync(archiveDir)) return;

    const archive = await readArchive(ctx.cwd);
    if (archive.length === 0) return;

    const config = await readConfig(ctx.cwd);
    const domain = config?.domain ?? "unknown";
    const latestGen = archive[archive.length - 1];

    const snippet =
      `\n\n## HyperAgents Context\n` +
      `An evolutionary archive is active in .hyperagents/ (${archive.length} generation(s), domain: ${domain}).\n` +
      `Latest generation: gen_${latestGen?.genid ?? "?"}\n` +
      `Use hyperagents_* tools to read the archive, select parents, and append new generations.\n` +
      `Commands: /hyperagents:evolve, /hyperagents:status, /hyperagents:archive, /hyperagents:select-parent`;

    return { systemPrompt: event.systemPrompt + snippet };
  });
}
