# claude-ralph

Shared Claude Code tools for autonomous AI development loops.

Provides versioned, shareable **skills**, **agents**, **rules**, and the **Ralph loop** — a multi-iteration autonomous coding agent that implements PRD user stories one at a time.

---

## What's included

```
claude-ralph/
├── setup.sh                      # Symlink installer for target projects
│
├── skills/
│   ├── prd/SKILL.md              # PRD generator skill
│   └── ralph/SKILL.md            # PRD-to-JSON converter + multi-model docs
│
├── agents/
│   └── explorer.md               # Fast read-only codebase explorer
│
├── rules/
│   └── commits.md                # Atomic commit conventions
│
└── ralph/
    ├── ralph.sh                  # Autonomous agent loop
    ├── research.sh               # Pre-story research via OpenRouter
    ├── CLAUDE.md.template        # Prompt template (fill per project)
    └── prd.json.example          # Schema with all fields documented
```

---

## Quick start

### 1. Add as git submodule

```bash
cd your-project
git submodule add git@github.com:heimo/claude-ralph .claude/shared
git submodule update --init
```

### 2. Run setup

```bash
.claude/shared/setup.sh
```

This creates symlinks in `.claude/skills/`, `.claude/agents/`, `.claude/rules/`, and `scripts/ralph/`.

### 3. Configure your project

```bash
# Fill in project-specific prompt
cp .claude/shared/ralph/CLAUDE.md.template scripts/ralph/CLAUDE.md
# (edit scripts/ralph/CLAUDE.md with your architecture, quality checks, etc.)

# Create your PRD (use /ralph skill in Claude Code, or manually)
cp .claude/shared/ralph/prd.json.example scripts/ralph/prd.json
# (edit scripts/ralph/prd.json with your user stories)

chmod +x scripts/ralph/ralph.sh scripts/ralph/research.sh
```

### 4. Run Ralph

```bash
# Basic run
./scripts/ralph/ralph.sh

# With research (needs OpenRouter key)
export OPENROUTER_API_KEY=sk-or-...
./scripts/ralph/ralph.sh

# Custom prd-dir (e.g., monorepo with multiple features)
./scripts/ralph/ralph.sh --prd-dir tasks/my-feature/

# Specify max iterations
./scripts/ralph/ralph.sh 15
```

---

## How Ralph works

1. Reads `prd.json` and picks the highest-priority story where `passes: false`
2. Optionally runs a **research query** (if `research: true` in the story) via OpenRouter
3. Spawns a fresh Claude instance with the project's `CLAUDE.md` prompt + research context
4. Claude implements the story, runs quality checks, commits, and marks the story `passes: true`
5. Repeats until all stories pass or max iterations reached

---

## Multi-model support

Each story can specify a `model` field:

| Value | Model used |
|-------|------------|
| `sonnet` | claude-sonnet-4-6 (default) |
| `opus` | claude-opus-4-6 |
| `haiku` | claude-haiku-4-5-20251001 |
| `openrouter:model/name` | Any model via OpenRouter API |

Example OpenRouter models:

| Category | Model |
|----------|-------|
| Research | `perplexity/sonar-pro` |
| Reasoning | `google/gemini-2.0-flash-thinking-exp` |
| Code | `deepseek/deepseek-r1` |

---

## Research support

Stories with `research: true` get a pre-implementation research query:

```json
{
  "id": "US-005",
  "title": "Integrate Stripe",
  "research": true,
  "research_query": "Stripe payment intents best practices 2025 Node.js",
  "research_model": "perplexity/sonar-pro",
  "model": "opus"
}
```

Requires `OPENROUTER_API_KEY` to be set. If not set, the research phase is silently skipped.

---

## prd.json schema

See `ralph/prd.json.example` for a fully documented example with all fields.

Key fields per story:

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | US-001, US-002, … |
| `title` | string | Short imperative title |
| `description` | string | User story format |
| `acceptanceCriteria` | string[] | Verifiable checklist |
| `priority` | number | Dependency order (1 = first) |
| `passes` | boolean | `false` until completed |
| `tddType` | string | testable / scaffold / frontend / infra |
| `effort` | string | low / medium / high |
| `model` | string | Claude shorthand or `openrouter:model/name` |
| `research` | boolean | Run research before this story |
| `research_query` | string | The research query |
| `research_model` | string | OpenRouter model for research |
| `notes` | string | Hints for the agent |

---

## Updating

```bash
# Pull latest shared tools
git submodule update --remote .claude/shared
git add .claude/shared
git commit -m "chore: update claude-ralph to latest"
```

---

## Skills (Claude Code)

After setup, these slash commands are available in Claude Code:

- `/prd` — Generate a PRD with clarifying questions
- `/ralph` — Convert a PRD to `prd.json` format

---

## License

MIT
