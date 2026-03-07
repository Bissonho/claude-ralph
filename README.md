# ralph-cli

Autonomous AI agent loop for Claude Code. Iterates through PRD user stories, implementing one per iteration until all pass.

## Install

```bash
npm install -g ralph-cli
# or use directly
npx ralph-cli
```

## Quick Start

```bash
# 1. Initialize in your project
ralph init

# 2. Edit .ralph/prd.json — add your user stories

# 3. Run the loop
ralph run
```

## How It Works

1. Reads `.ralph/prd.json` — picks the highest-priority story where `passes: false`
2. Generates a token-optimized prompt (~500 tokens vs ~2500 in v1)
3. Spawns a fresh Claude Code instance with `--dangerously-skip-permissions`
4. Agent implements the story, runs quality checks, commits, marks `passes: true`
5. Repeats until all stories pass or max iterations reached

## CLI

```
ralph init                      Initialize .ralph/ in current project
ralph run [options]             Start the agent loop
ralph status                    Show progress
ralph mcp                      Start MCP server (for Claude Code)
```

### Run Options

```
--max-iterations <n>            Max iterations (default: 30)
--tool <claude|amp>             Agent tool (default: claude)
--prd-dir <path>                PRD directory (default: .ralph/)
--research-model <model>        Default research model
```

## MCP Integration (Claude Code manages Ralph)

Add to your project's `.mcp.json`:

```json
{
  "mcpServers": {
    "ralph": {
      "command": "npx",
      "args": ["ralph-cli", "mcp"]
    }
  }
}
```

### MCP Tools

| Tool | Description |
|------|-------------|
| `ralph_status` | Compact progress JSON |
| `ralph_list_stories` | List stories (filter: all/pending/done) |
| `ralph_add_story` | Add a story to prd.json |
| `ralph_update_story` | Update story fields |
| `ralph_remove_story` | Remove a story |
| `ralph_add_context` | Add codebase pattern to progress.txt |
| `ralph_start` | Start the loop in background |
| `ralph_init` | Initialize .ralph/ |

## prd.json Schema

```json
{
  "project": "My App",
  "branchName": "ralph/feature-name",
  "description": "Feature description",
  "qualityChecks": [
    { "name": "lint", "command": "npm run lint" },
    { "name": "test", "command": "npm test" }
  ],
  "userStories": [
    {
      "id": "US-001",
      "title": "Story title",
      "description": "As a user, I want...",
      "acceptanceCriteria": ["Criterion 1", "Criterion 2"],
      "priority": 1,
      "passes": false,
      "effort": "medium",
      "model": "sonnet",
      "notes": "Context for the agent"
    }
  ]
}
```

### Story Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | US-001, US-002, etc. |
| `title` | string | Short imperative title |
| `description` | string | User story format |
| `acceptanceCriteria` | string[] | Verifiable checklist |
| `priority` | number | Dependency order (1 = first) |
| `passes` | boolean | `false` until completed |
| `tddType` | string | testable / scaffold / frontend / infra |
| `effort` | string | low / medium / high |
| `model` | string | opus / sonnet / haiku / openrouter:model/name |
| `research` | boolean | Run research before this story |
| `research_query` | string | The research query |
| `notes` | string | Hints for the agent |

### Model Selection

| Model | When |
|-------|------|
| `opus` | Complex: 8+ files, architecture decisions |
| `sonnet` | Standard: most stories (default) |
| `haiku` | Simple: 1-2 files, minor fixes |
| `openrouter:*` | Any OpenRouter model |

## Token Optimization

Ralph v2 generates prompts that are ~75% smaller than v1:
- Tells agent to read `CLAUDE.md` from disk (not embedded in prompt)
- Only includes current story details (not all stories)
- Only sends Codebase Patterns (not full progress history)
- Uses `--effort` flag to control response verbosity

## Git Submodule (Alternative Install)

```bash
git submodule add git@github.com:heimo/claude-ralph .claude/shared
.claude/shared/setup.sh
```

## License

MIT
