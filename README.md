<div align="center">

<!-- Logo/Banner placeholder - uncomment and add your image -->
<!-- <img src="assets/banner.png" alt="HyperAgents Banner" width="800"> -->

<h1>HyperAgents</h1>

<p>Self-referential self-improving agents that can optimize for any computable task</p>

<p>
<a href="LICENSE.md"><img src="https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-lightgrey.svg?style=for-the-badge" alt="License: CC BY-NC-SA 4.0"></a>
<a href="https://arxiv.org/abs/2603.19461"><img src="https://img.shields.io/badge/arXiv-2603.19461-b31b1b.svg?style=for-the-badge&logo=arxiv" alt="arXiv"></a>
<a href="https://ai.meta.com/research/publications/hyperagents/"><img src="https://img.shields.io/badge/-Blog-%238D6748?style=for-the-badge&logo=Website&logoColor=white"></a>
<a href="https://x.com/jennyzhangzt/status/2036099935083618487"><img src="https://img.shields.io/badge/twitter-%230077B5.svg?&style=for-the-badge&logo=twitter&logoColor=white&color=00acee"></a>
</p>

---

</div>

> **This fork adds a Claude Code plugin, Pi extension, and npm package** that bring HyperAgents' self-referential self-improvement patterns to your everyday development workflow. See [Agent Extensions](#agent-extensions) below.

---

## Agent Extensions

### Claude Code Plugin

Install the HyperAgents plugin for Claude Code:

```bash
# From the marketplace (recommended)
/plugin install https://github.com/Zpankz/hyperagents

# Or via npm
/plugin install hyperagents
```

**Commands:**

| Command | Description |
|---------|-------------|
| `/hyperagents:evolve` | Start or resume an evolutionary improvement loop |
| `/hyperagents:evaluate` | Evaluate a generation against fitness criteria |
| `/hyperagents:archive` | View, query, and manage the evolutionary archive |
| `/hyperagents:select-parent` | Select next parent with configurable strategy |
| `/hyperagents:status` | Show evolution progress dashboard |

**Agents:** meta-agent (Opus), task-agent (Sonnet), evaluator (Haiku), ensemble-agent (Haiku)

**Skills:** Self-Improve, Evolutionary Archive, Fitness Evaluation, Parent Selection, Domain Harness, Staged Evaluation

### Pi Extension

Install the HyperAgents extension for [Pi coding agent](https://github.com/nicholasgasior/pi-coding-agent):

```bash
# Recommended: install directly from GitHub as a Pi package
pi install https://github.com/Zpankz/HyperAgents.git

# Then reload or restart Pi
/reload
```

Legacy/manual install:

```bash
cp -R pi-extension ~/.pi/agent/extensions/hyperagents
```

Provides the same commands (`/hyperagents:evolve`, `/hyperagents:status`, etc.) plus LLM-callable tools (`hyperagents_status`, `hyperagents_read_archive`, `hyperagents_append_archive`, `hyperagents_select_parent`, `hyperagents_read_config`, `hyperagents_write_config`).

### npm Package

```bash
npm install hyperagents
```

### How It Works

HyperAgents runs an evolutionary loop over your code:

```
SELECT PARENT --> MUTATE (meta-agent) --> EVALUATE (fitness) --> ARCHIVE --> repeat
```

Each generation, a meta-agent modifies target code in a sandboxed git worktree. Changes are scored by a pluggable fitness function. The best mutations survive and become parents for the next generation. The system can even improve its own selection algorithms and evaluation criteria.

### Repository Structure

```
.
├── package.json                      # Pi package manifest
├── .claude-plugin/marketplace.json   # Claude Code marketplace registry
├── plugins/hyperagents/              # Claude Code plugin
│   ├── .claude-plugin/plugin.json
│   ├── commands/                     # 5 slash commands
│   ├── agents/                       # 4 specialized subagents
│   ├── skills/                       # 6 auto-activating skills
│   ├── hooks/                        # 3 event-driven hooks
│   └── scripts/                      # 2 CLI utilities
├── pi-extension/                     # Pi coding agent extension
│   └── index.ts
├── claude-plugin/                    # Standalone Claude plugin (mirrors plugins/hyperagents)
└── [original HyperAgents code...]    # Meta's research implementation
```

---

## Original HyperAgents Research

### Setup
```bash
# API keys, put these into .env file
OPENAI_API_KEY=...
ANTHROPIC_API_KEY=...
GEMINI_API_KEY=...
```

```bash
# Install things
sudo dnf install -y python3.12-devel
sudo dnf install -y graphviz graphviz-devel cmake ninja-build bzip2-devel zlib-devel ncurses-devel libffi-devel
```

```bash
# Create virtual environment
python3.12 -m venv venv_nat
source venv_nat/bin/activate
pip install -r requirements.txt
pip install -r requirements_dev.txt
# To build the docker container
docker build --network=host -t hyperagents .
```

```bash
# Setup initial agents
bash ./setup_initial.sh
```

## Running HyperAgents

```bash
# See the script for args, and baseline selections
python generate_loop.py --domains <domain>
```

By default, outputs will be saved in `outputs/` directory.

## File Structure
- `agent/` code for using foundation models
- `analysis/` scripts used for plotting and analysis
- `domains/` code for each domain
- `utils/` common code used in the repo
- `run_meta_agent.py` script to help run the meta agent and get the diffs
- `meta_agent.py` main implementation of the meta agent
- `task_agent.py` main implementation of the task agent
- `generate_loop.py` entry point for running the algorithm

## Logs from Experiments

The experiment logs are stored as a multi-part ZIP archive. To extract them, ensure all .z01, .z02, etc., files are in the same directory as the .zip file, then run:
```bash
zip -s 0 outputs_os_parts.zip --out unsplit_logs.zip
unzip unsplit_outputs.zip
```

## Safety Consideration
> [!WARNING]  
> This repository involves executing untrusted, model-generated code. We strongly advise users to be aware of the associated safety risks. While it is highly unlikely that such code will perform overtly malicious actions under our current settings and with the models we use, it may still behave destructively due to limitations in model capability or alignment. By using this repository, you acknowledge and accept these risks.

## Citing
If you find this project useful, please consider citing:
```bibtex
@misc{zhang2026hyperagents,
      title={Hyperagents}, 
      author={Jenny Zhang and Bingchen Zhao and Wannan Yang and Jakob Foerster and Jeff Clune and Minqi Jiang and Sam Devlin and Tatiana Shavrina},
      year={2026},
      eprint={2603.19461},
      archivePrefix={arXiv},
      primaryClass={cs.AI},
      url={https://arxiv.org/abs/2603.19461}, 
}
```

