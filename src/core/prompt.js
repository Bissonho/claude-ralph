// Token-optimized prompt generator
// Goal: ~500 tokens instead of ~2500 tokens per iteration
// The agent reads CLAUDE.md and progress.txt from disk — we don't embed them

export function generatePrompt(config, story, patterns) {
  const { total, done } = countProgress(config);
  const qc = formatQualityChecks(config);

  return `You are Ralph, an autonomous coding agent. Implement ONE story, then stop.

## Setup
1. Read CLAUDE.md in project root for conventions
2. Read .ralph/progress.txt — check "Codebase Patterns" section
3. Branch: \`${config.branchName}\` — checkout or create from main if needed

## Story: ${story.id} — ${story.title}
${story.description}

### Acceptance Criteria
${story.acceptanceCriteria.map((c) => `- ${c}`).join('\n')}
${story.notes ? `\n### Notes\n${story.notes}` : ''}
${qc ? `\n## Quality Checks (ALL must pass)\n\`\`\`bash\n${qc}\n\`\`\`` : ''}

## After Implementation
1. Quality checks pass? Commit: \`feat: [${story.id}] - ${story.title}\`
2. Set \`"passes": true\` for ${story.id} in .ralph/prd.json
3. Append to .ralph/progress.txt:
\`\`\`
## [Date] - ${story.id}
- Implemented: ...
- Files: ...
- Learnings: ...
---
\`\`\`
4. Add reusable patterns to "## Codebase Patterns" at TOP of progress.txt
5. ALL stories done? Reply: <promise>COMPLETE</promise>

## Rules
- ONE story only (${story.id}). Never touch other stories.
- Never: rm -rf, git push --force, edit .env
- Progress: ${done}/${total} complete
${patterns ? `\n## Codebase Patterns\n${patterns}` : ''}`;
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
