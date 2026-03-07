// Token-optimized prompt generator
// Goal: ~500 tokens instead of ~2500 tokens per iteration
// The agent reads CLAUDE.md and progress.txt from disk — we don't embed them

export function generatePrompt(config, story, patterns) {
  const { total, done } = countProgress(config);
  const qc = formatQualityChecks(config);
  const tddType = story.tddType || 'frontend';

  return `You are an autonomous coding agent running with full permissions. You MUST execute ALL commands yourself using your tools. NEVER ask the user to do anything. NEVER suggest commands — RUN them. You have --dangerously-skip-permissions enabled. There is no human watching. ACT.

## Step 1: Context (do this FIRST)
Use your Read tool to read these files NOW:
- CLAUDE.md (project root) — coding conventions, architecture, commands
- .ralph/progress.txt — previous learnings and codebase patterns

## Step 2: Branch
Run: git checkout ${config.branchName} 2>/dev/null || git checkout -b ${config.branchName}

## Step 3: Implement this story
**${story.id}: ${story.title}**
${story.description}

**Acceptance Criteria — every item MUST be true when you finish:**
${story.acceptanceCriteria.map((c) => `- ${c}`).join('\n')}
${story.notes ? `\n**Notes:** ${story.notes}` : ''}
${tddType === 'testable' || tddType === 'backend' ? `\n**TDD required:** Write failing tests FIRST, then implement to make them pass.` : ''}

## Step 4: Verify
${qc ? `Run ALL quality checks and fix any failures:\n\`\`\`bash\n${qc}\n\`\`\`\nDo NOT skip this. If a check fails, fix the code and re-run until all pass.` : 'Run project quality checks (lint, test, build) and fix any failures.'}

## Step 5: Commit & Update
After ALL checks pass, execute these commands:
1. git add the changed files (be specific, no git add -A)
2. git commit with message: feat: [${story.id}] - ${story.title}
3. Edit .ralph/prd.json — set "passes": true for story ${story.id}
4. Append to .ralph/progress.txt:
## ${new Date().toISOString().split('T')[0]} - ${story.id}
- Implemented: (what you built)
- Files: (files changed)
- Learnings: (patterns discovered)
---

## HARD RULES
- You are FULLY AUTONOMOUS. Execute everything yourself. Never say "you should run" or "please run".
- ONE story only: ${story.id}. Do not touch other stories.
- Never: rm -rf, git push --force, edit .env files
- If something fails, debug and fix it yourself. Do not give up.
- Progress: ${done}/${total} stories complete${total - done <= 1 ? '. This is the LAST story — reply with <promise>COMPLETE</promise> after finishing.' : '.'}
${patterns ? `\n## Codebase Patterns (from previous iterations)\n${patterns}` : ''}`;
}

function countProgress(config) {
  const total = config.userStories.length;
  const done = config.userStories.filter((s) => s.passes).length;
  return { total, done };
}

function formatQualityChecks(config) {
  if (!config.qualityChecks || config.qualityChecks.length === 0) return null;
  return config.qualityChecks.map((c) => `# ${c.name}\n${c.command}`).join('\n\n');
}
