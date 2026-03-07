import { init } from './commands/init.js';
import { run } from './commands/run.js';
import { status } from './commands/status.js';
import { worktreeCommand } from './commands/worktree.js';
import { startMcpServer } from './mcp/server.js';
import { startDashboard } from './dashboard/server.js';
import { startHub } from './hub/server.js';
import { c } from './utils.js';

const HELP = `
${c.bold}Ralph${c.reset} — Autonomous AI agent loop for Claude Code

${c.bold}Usage:${c.reset}
  ralph init                      Initialize .ralph/ in current project
  ralph run [options]             Start the agent loop
  ralph status                    Show progress
  ralph worktree <subcommand>     Manage git worktrees for parallel runs
  ralph dashboard [--port 3741]   Open visual task board (live updates)
  ralph hub [--port 3742]         Unified dashboard for all active loops
  ralph extension                 Install VS Code extension
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

    case 'worktree':
      return worktreeCommand(args.slice(1));

    case 'dashboard':
    case 'ui':
      return startDashboard(parseDashboardArgs(args.slice(1)));

    case 'hub':
      return startHub(parseHubArgs(args.slice(1)));

    case 'extension':
    case 'ext':
      return installExtension();

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

async function installExtension() {
  const { execSync } = await import('child_process');
  const { existsSync, readdirSync } = await import('fs');
  const { fileURLToPath } = await import('url');
  const { dirname, join } = await import('path');

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const vscodeDir = join(__dirname, '..', 'vscode');

  // Find .vsix file
  let vsixPath = null;
  if (existsSync(vscodeDir)) {
    const files = readdirSync(vscodeDir).filter((f) => f.endsWith('.vsix'));
    if (files.length > 0) {
      vsixPath = join(vscodeDir, files[files.length - 1]);
    }
  }

  if (!vsixPath) {
    console.error(`${c.red}error${c.reset} No .vsix file found. Run 'cd vscode && npm run compile && npx @vscode/vsce package' first.`);
    process.exit(1);
  }

  console.log(`${c.cyan}info${c.reset} Installing VS Code extension from ${vsixPath}`);
  try {
    execSync(`code --install-extension "${vsixPath}" --force`, { stdio: 'inherit' });
    console.log(`${c.green}done${c.reset} Extension installed. Reload VS Code to activate.`);
  } catch {
    console.error(`${c.red}error${c.reset} Failed to install. Is 'code' command available? Run 'Shell Command: Install code command' in VS Code.`);
    process.exit(1);
  }
}

function parseHubArgs(args) {
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port' || args[i] === '-p') opts.port = parseInt(args[++i], 10);
    if (args[i] === '--token') opts.token = args[++i];
  }
  return opts;
}
