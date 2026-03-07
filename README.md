# Ralph

**Autonomous AI agent loop for Claude Code.** Give it a PRD, it builds your project story by story.

Ralph reads your user stories from a simple JSON file, spawns a fresh Claude Code instance for each one, runs quality checks, commits, and moves to the next. You watch (or go grab coffee).

---

## Why MCP instead of a shell script?

Ralph started as a [bash script](ralph/ralph.sh) — it worked, but was a one-way street. The MCP architecture changes everything:

| | Shell Script (`ralph.sh`) | MCP Server (`ralph mcp`) |
|---|---|---|
| **Communication** | One-way. Fire and forget | Bidirectional. Claude reads state, makes decisions, reports back |
| **PRD creation** | Manual JSON editing | Conversational — Claude asks what you want to build, generates the PRD |
| **Status** | Open terminal, run `ralph status` | Claude queries status mid-conversation: "how's it going?" |
| **Multi-PRD** | Manual file management | Built-in archive/create flow with pattern carryover |
| **Decisions** | None — runs blindly | Smart — checks state first, asks "archive or continue?" |
| **Dependencies** | Requires `jq`, bash, manual CLAUDE.md | Zero dependencies — pure Node.js |
| **Context switching** | Terminal ↔ Editor ↔ Claude | Everything inside Claude Code |
| **Model selection** | Static per story | Claude can suggest models based on story complexity |

**The core insight:** with MCP, Claude Code becomes the orchestrator. It doesn't just run tasks — it understands your project, creates the plan, manages the lifecycle, and keeps you in the loop. The shell script runs code; the MCP server runs a workflow.

```
Without MCP:  You → edit JSON → run script → check terminal → edit JSON → run again
With MCP:     You → "build me X" → Claude creates PRD → starts loop → reports progress → done
```

---

## 1-Minute Setup

Open Claude Code in your project and paste this:

```
Install Ralph globally: npm install -g github:Bissonho/claude-ralph

Then run these commands:
1. ralph init
2. Find where ralph is installed by running: which ralph
3. Create .mcp.json using the FULL PATH from step 2, like:
   {"mcpServers":{"ralph":{"command":"/opt/homebrew/bin/ralph","args":["mcp"]}}}
   (the path may differ on your machine — use the output from `which ralph`)

Once done, ask me: "What do you want to build?" — then create a PRD with user stories using the ralph_create_prd MCP tool, and start the loop with ralph_start.
```

That's it. Claude will install Ralph, configure MCP, ask what you want to build, generate the PRD, and start coding autonomously.

> **Why the full path?** MCP servers are spawned with a minimal PATH. Using the absolute path to `ralph` ensures Claude Code can always find it.

---

## How It Works

```
prd.json ──> Ralph picks next story ──> Spawns Claude Code ──> Implements + Tests + Commits ──> Marks done ──> Repeats
                                              |
                                         Fresh context each time
                                         (no token waste)
```

1. Reads `.ralph/prd.json` -- picks highest-priority story where `passes: false`
2. Generates a token-optimized prompt (~500 tokens)
3. Spawns fresh Claude Code with `--dangerously-skip-permissions`
4. Agent reads `CLAUDE.md`, implements the story, runs quality checks, commits
5. Marks `passes: true` in prd.json
6. Repeats until all stories pass or max iterations reached

## Install

```bash
# From GitHub (recommended — always latest)
npm install -g github:Bissonho/claude-ralph

# Verify
ralph --version
```

## Quick Start

```bash
cd your-project

# 1. Initialize Ralph
ralph init

# 2. Add MCP integration (use full path from `which ralph`)
echo '{"mcpServers":{"ralph":{"command":"'$(which ralph)'","args":["mcp"]}}}' > .mcp.json

# 3. Edit .ralph/prd.json with your stories (or let Claude do it via MCP)

# 4. Run the loop
ralph run
```

## CLI Commands

```
ralph init                        Initialize .ralph/ with auto-detected quality checks
ralph run [options]               Start the autonomous loop
ralph status                      Show progress
ralph dashboard [--port 3741]     Visual task board with live updates (SSE)
ralph mcp                         Start MCP server for Claude Code integration
```

### Run Options

```
--max-iterations <n>    Max iterations (default: 30)
--tool <claude|amp>     Agent tool (default: claude)
--prd-dir <path>        PRD directory (default: .ralph/)
--research-model <m>    Research model (default: perplexity/sonar-pro)
```

## VS Code Extension

Full visual dashboard integrated into VS Code sidebar.

```bash
cd claude-ralph/vscode
npm install
npm run vscode:install
```

**Features:**
- Activity Bar icon with sidebar panel
- TreeView of stories grouped by status (Running / Pending / Done)
- Progress bar with real-time updates
- Start/Stop loop buttons
- Dashboard webview panel
- Status bar indicator
- Add/Edit/Remove stories from the UI
- Archive PRD and start new

## MCP Integration

When Claude Code has Ralph as an MCP server, it can manage everything:

```json
{
  "mcpServers": {
    "ralph": {
      "command": "/opt/homebrew/bin/ralph",
      "args": ["mcp"]
    }
  }
}
```

> Use `which ralph` to find the correct path on your machine. Common locations:
> - macOS (Homebrew): `/opt/homebrew/bin/ralph`
> - macOS (nvm): `~/.nvm/versions/node/v22.x.x/bin/ralph`
> - Linux: `/usr/local/bin/ralph`

### MCP Tools

| Tool | Description |
|------|-------------|
| `ralph_check_prd` | Check if PRD exists and its state (empty/pending/complete) |
| `ralph_create_prd` | Create a new PRD with stories (archives existing if needed) |
| `ralph_archive` | Archive current PRD to .ralph/archive/ |
| `ralph_status` | Compact progress JSON |
| `ralph_list_stories` | List stories (filter: all/pending/done) |
| `ralph_add_story` | Add a story to existing PRD |
| `ralph_update_story` | Update story fields |
| `ralph_remove_story` | Remove a story |
| `ralph_add_context` | Add codebase pattern to progress.txt |
| `ralph_start` | Start the loop in background |
| `ralph_init` | Initialize .ralph/ |

## prd.json

```json
{
  "project": "My App",
  "branchName": "ralph/feature-name",
  "description": "What this PRD implements",
  "qualityChecks": [
    { "name": "lint", "command": "npm run lint" },
    { "name": "test", "command": "npm test" }
  ],
  "userStories": [
    {
      "id": "US-001",
      "title": "Add user authentication",
      "description": "As a user, I want to sign in so that...",
      "acceptanceCriteria": ["Login page exists", "JWT tokens work"],
      "priority": 1,
      "passes": false,
      "effort": "medium",
      "model": "sonnet",
      "notes": "Use bcrypt for passwords. Check existing auth/ folder."
    }
  ]
}
```

### Story Fields

| Field | Values | Description |
|-------|--------|-------------|
| `model` | `haiku` `sonnet` `opus` `openrouter:model/name` | Which AI model to use |
| `effort` | `low` `medium` `high` | Controls Claude's `--effort` flag |
| `tddType` | `testable` `scaffold` `frontend` `infra` | Determines commit pattern |
| `research` | `true/false` | Run web research before implementing |
| `priority` | `1, 2, 3...` | Execution order (lower = first) |

### Model Selection Guide

| Model | Cost | Use When |
|-------|------|----------|
| `haiku` | $ | Simple: 1-2 files, config changes, minor fixes |
| `sonnet` | $$ | Standard: most stories (default) |
| `opus` | $$$ | Complex: 8+ files, architecture, research tasks |
| `openrouter:*` | varies | Any OpenRouter model (needs OPENROUTER_API_KEY) |

## Multi-PRD Workflow

Ralph supports archiving completed PRDs and starting fresh:

```
PRD 1 (complete) ──> Archive ──> PRD 2 (in progress) ──> Archive ──> PRD 3
                        |                                      |
                   .ralph/archive/                    Patterns carry forward
                   2024-01-15-feature-a/              (progress.txt survives)
```

When you ask Claude to create a new PRD and one already exists, it will ask:
- **"Add to existing PRD?"** -- appends stories to current prd.json
- **"Archive and start new?"** -- moves current to archive, creates fresh

Codebase patterns from `progress.txt` always carry forward to the next PRD.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | For Claude Code |
| `OPENROUTER_API_KEY` | Optional | For research and OpenRouter models |

## Project Structure

```
.ralph/
  prd.json          # Current PRD with user stories
  progress.txt      # Append-only log + codebase patterns
  status.txt        # Live status (updated during loop)
  archive/          # Archived PRDs
    2024-01-15-feature-a/
      prd.json
      progress.txt
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, architecture, and guidelines.

## Updating

```bash
npm install -g github:Bissonho/claude-ralph
```

## License

MIT
