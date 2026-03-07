# Ralph — Claude Code Instructions

## Project Overview
Ralph is an autonomous AI agent loop for Claude Code. It reads user stories from a PRD (prd.json), spawns fresh Claude Code instances for each one, runs quality checks, commits, and moves to the next.

**Three interfaces:**
- **CLI** (`ralph run`) — the core loop
- **MCP Server** (`ralph mcp`) — Claude Code integration via JSON-RPC over stdio
- **VS Code Extension** (`vscode/`) — visual dashboard

## Architecture

```
bin/ralph.js → src/cli.js → command router
                              ├── src/commands/init.js      # ralph init
                              ├── src/commands/run.js       # ralph run (main loop)
                              ├── src/commands/status.js    # ralph status
                              ├── src/mcp/server.js         # ralph mcp (MCP server)
                              └── src/dashboard/server.js   # ralph dashboard
```

Core modules:
- `src/core/config.js` — PRD/progress/status file management
- `src/core/prompt.js` — token-optimized prompt generation for agents
- `src/core/runner.js` — agent spawning (Claude Code, AMP, OpenRouter)
- `src/utils.js` — model resolution, project detection, formatting

## Commands

```bash
node bin/ralph.js --help          # CLI help
node bin/ralph.js mcp             # Start MCP server (for testing)
node --test src/**/*.test.js      # Run tests
cd vscode && npm run compile      # Build VS Code extension
```

## Critical Rules

**NEVER:**
- Add npm dependencies — the CLI must remain zero-dependency (Node.js built-ins only)
- Write to stdout in the MCP server outside of `transport.send()` — stdout IS the transport
- Remove the `ping` handler from MCP server — Claude Code needs it for health checks
- Break Content-Length framing in MCP responses
- Edit `vscode/node_modules/` or `node_modules/`

**ALWAYS:**
- Use ESM imports with `.js` extensions (`import { x } from './module.js'`)
- Handle errors in MCP tool handlers — unhandled errors break the connection
- Keep MCP responses compact (minimal tokens)
- Test MCP changes with the Content-Length framing protocol, not raw JSON
- Redirect `console.log` to stderr in MCP mode (stdout = transport)
- Return `{}` for `ping` method (NOT an error)

## MCP Server Protocol

The MCP server implements JSON-RPC 2.0 over stdio with Content-Length framing:

```
Content-Length: <byte_count>\r\n\r\n<json_body>
```

Required methods:
| Method | Response |
|--------|----------|
| `initialize` | `{protocolVersion, capabilities, serverInfo}` |
| `ping` | `{}` |
| `notifications/initialized` | none (notification) |
| `notifications/cancelled` | none (notification) |
| `tools/list` | `{tools: [...]}` |
| `tools/call` | `{content: [{type: "text", text: "..."}]}` |

## Code Style
- JavaScript ESM, semicolons, single quotes
- `camelCase` for variables/functions, `PascalCase` for classes
- TypeScript for VS Code extension only
- No build step for CLI — runs directly on Node.js 18+

## Testing MCP Changes

```bash
node -e '
const { spawn } = require("child_process");
const child = spawn("node", ["bin/ralph.js", "mcp"], { stdio: ["pipe", "pipe", "pipe"] });
child.stdout.on("data", (d) => console.log(d.toString()));
child.stderr.on("data", (d) => console.error(d.toString()));
const msg = JSON.stringify({jsonrpc:"2.0",id:1,method:"ping"});
child.stdin.write("Content-Length: " + Buffer.byteLength(msg) + "\r\n\r\n" + msg);
setTimeout(() => child.kill(), 2000);
'
```

Expected: `Content-Length: 36\r\n\r\n{"jsonrpc":"2.0","id":1,"result":{}}`

## Commit Convention
```
type: short description

Co-Authored-By: Claude <noreply@anthropic.com>
```
Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`
