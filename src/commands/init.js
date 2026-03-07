import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join, basename } from 'path';
import { detectProjectType, info, success, warn, c } from '../utils.js';

export async function init() {
  const cwd = process.cwd();
  const ralphDir = join(cwd, '.ralph');

  if (existsSync(join(ralphDir, 'prd.json'))) {
    warn('.ralph/prd.json already exists. Use ralph run to start.');
    return;
  }

  // Create directory
  mkdirSync(ralphDir, { recursive: true });

  // Auto-detect quality checks
  const checks = detectProjectType();
  const projectName = detectProjectName(cwd);

  info(`Detected project: ${c.bold}${projectName}${c.reset}`);
  if (checks.length > 0) {
    info(`Detected quality checks: ${checks.map((c) => c.name).join(', ')}`);
  } else {
    warn('No quality checks detected. Add them to .ralph/prd.json manually.');
  }

  // Create prd.json
  const prd = {
    project: projectName,
    branchName: 'ralph/my-feature',
    description: 'Describe your feature here',
    qualityChecks: checks.length > 0 ? checks : [
      { name: 'lint', command: 'echo "Add your lint command"' },
      { name: 'test', command: 'echo "Add your test command"' },
    ],
    userStories: [
      {
        id: 'US-001',
        title: 'First story',
        description: 'As a user, I want...',
        acceptanceCriteria: ['Criterion 1', 'Criterion 2'],
        priority: 1,
        passes: false,
        tddType: 'frontend',
        effort: 'medium',
        model: 'sonnet',
        research: false,
        research_query: '',
        research_model: 'perplexity/sonar-pro',
        notes: '',
      },
    ],
  };

  writeFileSync(join(ralphDir, 'prd.json'), JSON.stringify(prd, null, 2) + '\n');

  // Create progress.txt
  writeFileSync(
    join(ralphDir, 'progress.txt'),
    `# Ralph Progress Log\nStarted: ${new Date().toISOString()}\n---\n\n## Codebase Patterns\n`
  );

  // Create .gitignore
  writeFileSync(
    join(ralphDir, '.gitignore'),
    `status.txt\n.lock\n.last-branch\n.research_context.md\n`
  );

  // Create .mcp.json suggestion
  const mcpConfig = {
    mcpServers: {
      ralph: {
        command: 'npx',
        args: ['ralph-cli', 'mcp'],
      },
    },
  };

  success('Initialized .ralph/');
  console.log('');
  console.log(`${c.bold}Next steps:${c.reset}`);
  console.log(`  1. Edit ${c.cyan}.ralph/prd.json${c.reset} — add your user stories`);
  console.log(`  2. Run ${c.cyan}ralph run${c.reset} to start the loop`);
  console.log('');
  console.log(`${c.dim}Optional: Add Ralph as MCP server for Claude Code:${c.reset}`);
  console.log(`  Add to .mcp.json: ${JSON.stringify(mcpConfig.mcpServers.ralph)}`);
}

function detectProjectName(cwd) {
  try {
    const pkg = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf-8'));
    if (pkg.name) return pkg.name;
  } catch { /* ignore */ }

  try {
    const pubspec = readFileSync(join(cwd, 'pubspec.yaml'), 'utf-8');
    const match = pubspec.match(/^name:\s*(.+)/m);
    if (match) return match[1].trim();
  } catch { /* ignore */ }

  return basename(cwd);
}
