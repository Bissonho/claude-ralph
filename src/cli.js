import { init } from './commands/init.js';
import { run } from './commands/run.js';
import { status } from './commands/status.js';
import { startMcpServer } from './mcp/server.js';
import { startDashboard } from './dashboard/server.js';
import { c } from './utils.js';

const HELP = `
${c.bold}Ralph${c.reset} — Autonomous AI agent loop for Claude Code

${c.bold}Usage:${c.reset}
  ralph init                      Initialize .ralph/ in current project
  ralph run [options]             Start the agent loop
  ralph status                    Show progress
  ralph dashboard [--port 3741]   Open visual task board (live updates)
  ralph mcp                      Start MCP server (for Claude Code)

${c.bold}Run options:${c.reset}
  --max-iterations <n>            Max iterations (default: 30)
  --tool <claude|amp>             Agent tool (default: claude)
  --prd-dir <path>                PRD directory (default: .ralph/)
  --research-model <model>        Default research model

${c.bold}MCP integration:${c.reset}
  Add to .mcp.json:
  { "ralph": { "command": "npx", "args": ["ralph-cli", "mcp"] } }
`;

export async function cli(args) {
  const command = args[0];

  switch (command) {
    case 'init':
      return init();

    case 'run':
      return run(parseRunArgs(args.slice(1)));

    case 'status':
      return status(parseStatusArgs(args.slice(1)));

    case 'dashboard':
    case 'ui':
      return startDashboard(parseDashboardArgs(args.slice(1)));

    case 'mcp':
      return startMcpServer();

    case '--help':
    case '-h':
    case 'help':
      console.log(HELP);
      return;

    case '--version':
    case '-v':
      try {
        const { readFileSync } = await import('fs');
        const { fileURLToPath } = await import('url');
        const { dirname, join } = await import('path');
        const __dirname = dirname(fileURLToPath(import.meta.url));
        const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));
        console.log(pkg.version);
      } catch {
        console.log('unknown');
      }
      return;

    case undefined:
      console.log(HELP);
      return;

    default:
      console.error(`Unknown command: ${command}`);
      console.log(HELP);
      process.exit(1);
  }
}

function parseRunArgs(args) {
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--max-iterations':
      case '-n':
        opts.maxIterations = parseInt(args[++i], 10);
        break;
      case '--tool':
      case '-t':
        opts.tool = args[++i];
        break;
      case '--prd-dir':
        opts.prdDir = args[++i];
        break;
      case '--research-model':
        opts.researchModel = args[++i];
        break;
      case '--dry-run':
        opts.dryRun = true;
        break;
      default:
        // Allow bare number as max iterations
        if (/^\d+$/.test(args[i])) {
          opts.maxIterations = parseInt(args[i], 10);
        }
    }
  }
  return opts;
}

function parseStatusArgs(args) {
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--prd-dir') opts.prdDir = args[++i];
  }
  return opts;
}

function parseDashboardArgs(args) {
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port' || args[i] === '-p') opts.port = parseInt(args[++i], 10);
    if (args[i] === '--prd-dir') opts.prdDir = args[++i];
  }
  return opts;
}
