#!/bin/bash
# setup.sh — Create symlinks in the target project for claude-ralph shared tools
# Run from inside the target project root:
#   .claude/shared/setup.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(pwd)"

echo "claude-ralph setup"
echo "  Shared tools: $SCRIPT_DIR"
echo "  Project root: $PROJECT_ROOT"
echo ""

# Ensure .claude directories exist
mkdir -p "$PROJECT_ROOT/.claude/skills/prd"
mkdir -p "$PROJECT_ROOT/.claude/skills/ralph"
mkdir -p "$PROJECT_ROOT/.claude/agents"
mkdir -p "$PROJECT_ROOT/.claude/rules"
mkdir -p "$PROJECT_ROOT/scripts/ralph"

# Helper: create symlink, skip if already correct
link() {
  local src="$1"
  local dst="$2"

  if [ -L "$dst" ] && [ "$(readlink "$dst")" = "$src" ]; then
    echo "  [skip]   $dst → already linked"
    return
  fi

  if [ -e "$dst" ] && [ ! -L "$dst" ]; then
    echo "  [warn]   $dst exists as a real file — skipping (remove manually to symlink)"
    return
  fi

  ln -sf "$src" "$dst"
  echo "  [linked] $dst → $src"
}

# Skills
link "$SCRIPT_DIR/skills/prd/SKILL.md"   "$PROJECT_ROOT/.claude/skills/prd/SKILL.md"
link "$SCRIPT_DIR/skills/ralph/SKILL.md" "$PROJECT_ROOT/.claude/skills/ralph/SKILL.md"

# Agents
link "$SCRIPT_DIR/agents/explorer.md" "$PROJECT_ROOT/.claude/agents/explorer.md"

# Rules
link "$SCRIPT_DIR/rules/commits.md" "$PROJECT_ROOT/.claude/rules/commits.md"

# Ralph scripts
link "$SCRIPT_DIR/ralph/ralph.sh"    "$PROJECT_ROOT/scripts/ralph/ralph.sh"
link "$SCRIPT_DIR/ralph/research.sh" "$PROJECT_ROOT/scripts/ralph/research.sh"

echo ""
echo "Done. Symlinks created."
echo ""
echo "Next steps:"
echo "  1. Copy ralph/CLAUDE.md.template to scripts/ralph/CLAUDE.md and fill in placeholders"
echo "  2. Copy ralph/prd.json.example to scripts/ralph/prd.json and customize"
echo "  3. Make scripts executable: chmod +x scripts/ralph/ralph.sh scripts/ralph/research.sh"
echo "  4. Commit: git add .claude scripts/ralph && git commit -m 'chore: add claude-ralph shared tools'"
echo ""
echo "Run Ralph:"
echo "  OPENROUTER_API_KEY=sk-or-... ./scripts/ralph/ralph.sh"
