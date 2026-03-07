# Contributing to Ralph

## Architecture

```
ralph-cli/
├── bin/ralph.js              # CLI entry point (ESM)
├── src/
│   ├── cli.js                # Command router
│   ├── utils.js              # Shared utilities, model resolution, project detection
│   ├── core/
│   │   ├── config.js         # PRD/progress/status file management
│   │   ├── prompt.js         # Token-optimized prompt generation
│   │   └── runner.js         # Agent spawning (Claude/AMP/OpenRouter)
│   ├── commands/
│   │   ├── init.js           # `ralph init` — scaffold .ralph/
│   │   ├── run.js            # `ralph run` — the main loop
│   │   └── status.js         # `ralph status` — progress display
│   ├── mcp/
│   │   └── server.js         # MCP server (JSON-RPC over stdio)
│   └── dashboard/
│       └── server.js         # Web dashboard (SSE + built-in HTML)
├── vscode/                   # VS Code extension (TypeScript)
│   ├── src/
│   │   ├── extension.ts      # Extension entry point
│   │   ├── ralph/            # Config, types, file watcher
│   │   ├── views/            # TreeView, WebView, StatusBar
│   │   └── commands/         # Loop start/stop, story management
│   └── package.json          # Extension manifest
├── ralph/                    # Legacy shell scripts (kept for reference)
├── skills/                   # Claude Code skills (/prd, /ralph)
├── agents/                   # Claude Code agents (explorer)
└── rules/                    # Claude Code rules (commits)
```

## Development Setup

```bash
git clone https://github.com/Bissonho/claude-ralph.git
cd claude-ralph

# CLI — no build step, pure ESM JavaScript
node bin/ralph.js --help

# VS Code extension
cd vscode
npm install
npm run compile
# To install locally: npm run vscode:install
```

## Key Design Decisions

### Zero dependencies
The CLI has **no npm dependencies**. Everything is built with Node.js built-ins:
- `fs`, `path` for file operations
- `child_process` for spawning agents
- `http` for the dashboard server
- `process.stdin/stdout` for MCP stdio transport

This is intentional — Ralph is a tool that gets installed globally across many projects. Fewer dependencies = fewer conflicts, faster installs, smaller attack surface.

### ESM modules
The project uses `"type": "module"` in package.json. All imports use `.js` extensions. This is modern Node.js — no transpilation needed.

### MCP server: Content-Length framing
The MCP server uses LSP-style `Content-Length` framing over stdio. This is the standard for MCP servers communicating with Claude Code. The implementation is in `src/mcp/server.js` — a single file, ~500 lines, zero dependencies.

**Required MCP methods:**
- `initialize` — handshake, declares capabilities
- `ping` — health check (MUST return `{}`, not an error)
- `notifications/initialized` — acknowledgment (no response)
- `notifications/cancelled` — cancellation (no response)
- `tools/list` — returns tool definitions
- `tools/call` — executes a tool

### Fresh context per story
Each story gets a fresh Claude Code instance. This prevents context pollution between stories and ensures each story gets the full context window. The trade-off is slightly higher startup cost, but the reliability gain is worth it.

### progress.txt carries forward
When a PRD is archived, codebase patterns from `progress.txt` are extracted and included in the new progress file. This is how Ralph "learns" across PRDs without maintaining a separate knowledge base.

## Code Style

- **JavaScript**: ESM, no semicolons optional (we use them), single quotes
- **TypeScript** (VS Code extension): strict mode, single quotes
- **Files**: `kebab-case.js` for files, `camelCase` for variables, `PascalCase` for classes
- **No transpilation**: CLI runs directly on Node.js 18+, VS Code extension uses tsc

## Commit Convention

```
type: short description

Co-Authored-By: Claude <noreply@anthropic.com>
```

Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`

## Testing

```bash
# CLI
node --test src/**/*.test.js

# VS Code extension
cd vscode && npm run compile
```

## MCP Server Development

When modifying the MCP server (`src/mcp/server.js`):

1. **Always handle `ping`** — Claude Code sends this for health checks. Return `{"result":{}}`.
2. **Never write to stdout** outside of `transport.send()` — stdout is the MCP transport channel.
3. **`console.log` is redirected to stderr** — safe to use for debugging.
4. **Test with the framing protocol** — raw JSON won't work, you need `Content-Length` headers.

Quick test:
```bash
node -e '
const { spawn } = require("child_process");
const child = spawn("ralph", ["mcp"], { stdio: ["pipe", "pipe", "pipe"] });
child.stdout.on("data", (d) => console.log(d.toString()));
const msg = JSON.stringify({jsonrpc:"2.0",id:1,method:"initialize",params:{protocolVersion:"2024-11-05",capabilities:{},clientInfo:{name:"test",version:"1.0"}}});
child.stdin.write("Content-Length: " + Buffer.byteLength(msg) + "\r\n\r\n" + msg);
setTimeout(() => child.kill(), 2000);
'
```

## Adding MCP Tools

1. Add tool definition to `TOOLS` array in `src/mcp/server.js`
2. Add handler case in `handleTool()` function
3. Keep responses compact — MCP tool results count against Claude's context
4. Update README.md MCP Tools table
5. Test the full flow: `initialize` → `tools/list` → `tools/call`

## VS Code Extension Development

The extension mirrors the CLI's `Config` class for reading `.ralph/` files. Key views:

- **StoriesTreeProvider** — TreeView with story groups (Running/Pending/Done)
- **ProgressPanelProvider** — Sidebar webview with buttons
- **DashboardPanel** — Full webview with auto-refresh
- **StatusBarManager** — Bottom status bar item

To iterate:
```bash
cd vscode
npm run compile
# Then press F5 in VS Code to launch Extension Development Host
```

## Release Process

Ralph is distributed via GitHub — no npm registry needed:

```bash
# Users install with:
npm install -g github:Bissonho/claude-ralph

# To release: just push to main
git push origin main
```

Version bumps in `package.json` are manual. Update when making breaking changes.
