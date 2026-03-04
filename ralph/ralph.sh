#!/bin/bash
# Ralph — Autonomous AI agent loop
# Usage: ./ralph.sh [--tool claude|amp] [--prd-dir PATH] [--research-model MODEL] [max_iterations]
# Default: claude, 30 iterations, prd-dir=scripts/ralph/

set -e

# Parse arguments
TOOL="claude"
MAX_ITERATIONS=30
PRD_DIR=""
RESEARCH_MODEL="perplexity/sonar-pro"

while [[ $# -gt 0 ]]; do
  case $1 in
    --tool)
      TOOL="$2"
      shift 2
      ;;
    --tool=*)
      TOOL="${1#*=}"
      shift
      ;;
    --prd-dir)
      PRD_DIR="$2"
      shift 2
      ;;
    --prd-dir=*)
      PRD_DIR="${1#*=}"
      shift
      ;;
    --research-model)
      RESEARCH_MODEL="$2"
      shift 2
      ;;
    --research-model=*)
      RESEARCH_MODEL="${1#*=}"
      shift
      ;;
    *)
      if [[ "$1" =~ ^[0-9]+$ ]]; then
        MAX_ITERATIONS="$1"
      fi
      shift
      ;;
  esac
done

if [[ "$TOOL" != "amp" && "$TOOL" != "claude" ]]; then
  echo "Error: Invalid tool '$TOOL'. Must be 'amp' or 'claude'."
  exit 1
fi

# Resolve script and prd directories
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Default prd-dir: scripts/ralph/ relative to project root (two levels up from ralph/ in submodule)
if [ -z "$PRD_DIR" ]; then
  # Try to find prd.json: first check scripts/ralph/, then current dir
  PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
  if [ -f "$PROJECT_ROOT/scripts/ralph/prd.json" ]; then
    PRD_DIR="$PROJECT_ROOT/scripts/ralph"
  elif [ -f "$(pwd)/scripts/ralph/prd.json" ]; then
    PRD_DIR="$(pwd)/scripts/ralph"
  else
    PRD_DIR="$(pwd)/scripts/ralph"
    echo "Warning: prd.json not found. Expected at $PRD_DIR/prd.json"
  fi
fi

# Make PRD_DIR absolute
PRD_DIR="$(cd "$PRD_DIR" 2>/dev/null && pwd || echo "$PRD_DIR")"

PRD_FILE="$PRD_DIR/prd.json"
PROGRESS_FILE="$PRD_DIR/progress.txt"
STATUS_FILE="$PRD_DIR/status.txt"
ARCHIVE_DIR="$PRD_DIR/archive"
LAST_BRANCH_FILE="$PRD_DIR/.last-branch"
CLAUDE_MD="$PRD_DIR/CLAUDE.md"
RESEARCH_CONTEXT="$PRD_DIR/.research_context.md"

# Path to research.sh (sibling of ralph.sh)
RESEARCH_SH="$SCRIPT_DIR/research.sh"

echo "Ralph configuration:"
echo "  Tool:      $TOOL"
echo "  PRD dir:   $PRD_DIR"
echo "  Max iter:  $MAX_ITERATIONS"
echo ""

if [ ! -f "$PRD_FILE" ]; then
  echo "Error: prd.json not found at $PRD_FILE"
  echo "Create it first (use /ralph skill) or specify --prd-dir"
  exit 1
fi

if [ ! -f "$CLAUDE_MD" ]; then
  echo "Error: CLAUDE.md not found at $CLAUDE_MD"
  echo "Copy and fill in CLAUDE.md.template from claude-ralph/ralph/"
  exit 1
fi

# Archive previous run if branch changed
if [ -f "$PRD_FILE" ] && [ -f "$LAST_BRANCH_FILE" ]; then
  CURRENT_BRANCH=$(jq -r '.branchName // empty' "$PRD_FILE" 2>/dev/null || echo "")
  LAST_BRANCH=$(cat "$LAST_BRANCH_FILE" 2>/dev/null || echo "")

  if [ -n "$CURRENT_BRANCH" ] && [ -n "$LAST_BRANCH" ] && [ "$CURRENT_BRANCH" != "$LAST_BRANCH" ]; then
    DATE=$(date +%Y-%m-%d)
    FOLDER_NAME=$(echo "$LAST_BRANCH" | sed 's|^ralph/||')
    ARCHIVE_FOLDER="$ARCHIVE_DIR/$DATE-$FOLDER_NAME"

    echo "Archiving previous run: $LAST_BRANCH"
    mkdir -p "$ARCHIVE_FOLDER"
    [ -f "$PRD_FILE" ] && cp "$PRD_FILE" "$ARCHIVE_FOLDER/"
    [ -f "$PROGRESS_FILE" ] && cp "$PROGRESS_FILE" "$ARCHIVE_FOLDER/"
    echo "   Archived to: $ARCHIVE_FOLDER"

    echo "# Ralph Progress Log" > "$PROGRESS_FILE"
    echo "Started: $(date)" >> "$PROGRESS_FILE"
    echo "---" >> "$PROGRESS_FILE"
  fi
fi

# Track current branch
if [ -f "$PRD_FILE" ]; then
  CURRENT_BRANCH=$(jq -r '.branchName // empty' "$PRD_FILE" 2>/dev/null || echo "")
  if [ -n "$CURRENT_BRANCH" ]; then
    echo "$CURRENT_BRANCH" > "$LAST_BRANCH_FILE"
  fi
fi

# Initialize progress file if it doesn't exist
if [ ! -f "$PROGRESS_FILE" ]; then
  echo "# Ralph Progress Log" > "$PROGRESS_FILE"
  echo "Started: $(date)" >> "$PROGRESS_FILE"
  echo "---" >> "$PROGRESS_FILE"
fi

# Helper: update status file
update_status() {
  local iteration="$1"
  local story_id="$2"
  local model="$3"
  local status="$4"
  local passed=$(jq '[.userStories[] | select(.passes == true)] | length' "$PRD_FILE" 2>/dev/null || echo "?")
  local total=$(jq '.userStories | length' "$PRD_FILE" 2>/dev/null || echo "?")
  local pct=0
  if [[ "$total" =~ ^[0-9]+$ ]] && [ "$total" -gt 0 ]; then
    pct=$((passed * 100 / total))
  fi
  echo "${passed}/${total} (${pct}%) | ${story_id} | ${model} | ${status} | iter ${iteration}/${MAX_ITERATIONS} | $(date '+%H:%M:%S')" > "$STATUS_FILE"
}

# Helper: run research phase for a story
run_research() {
  local story_id="$1"
  local query="$2"
  local model="${3:-$RESEARCH_MODEL}"

  echo "  [research] Running pre-story research..."
  echo "  [research] Query: $query"
  echo "  [research] Model: $model"

  if [ ! -f "$RESEARCH_SH" ]; then
    echo "  [research] Warning: research.sh not found at $RESEARCH_SH — skipping"
    return 0
  fi

  if [ -z "${OPENROUTER_API_KEY:-}" ]; then
    echo "  [research] Warning: OPENROUTER_API_KEY not set — skipping research"
    return 0
  fi

  # Run research and save context
  {
    echo "# Research Context for $story_id"
    echo ""
    echo "**Query:** $query"
    echo "**Model:** $model"
    echo "**Date:** $(date)"
    echo ""
    echo "---"
    echo ""
    bash "$RESEARCH_SH" "$query" "$model" 2>/dev/null || echo "(Research failed — proceeding without context)"
  } > "$RESEARCH_CONTEXT"

  echo "  [research] Context saved to $RESEARCH_CONTEXT"
}

# Build prompt: CLAUDE.md + optional research context
build_prompt() {
  local story_id="$1"

  if [ -f "$RESEARCH_CONTEXT" ]; then
    {
      echo "# Research Context (Pre-loaded for $story_id)"
      echo ""
      cat "$RESEARCH_CONTEXT"
      echo ""
      echo "---"
      echo ""
      echo "# Ralph Agent Instructions"
      echo ""
      cat "$CLAUDE_MD"
    }
  else
    cat "$CLAUDE_MD"
  fi
}

echo "Starting Ralph - Tool: $TOOL - Max iterations: $MAX_ITERATIONS"

for i in $(seq 1 $MAX_ITERATIONS); do
  echo ""
  echo "==============================================================="
  echo "  Ralph Iteration $i of $MAX_ITERATIONS ($TOOL)"
  echo "==============================================================="

  # Extract story fields
  STORY_MODEL=$(jq -r '
    [.userStories[] | select(.passes == false)]
    | sort_by(.priority)
    | .[0].model // "sonnet"
  ' "$PRD_FILE" 2>/dev/null || echo "sonnet")

  STORY_EFFORT=$(jq -r '
    [.userStories[] | select(.passes == false)]
    | sort_by(.priority)
    | .[0].effort // "medium"
  ' "$PRD_FILE" 2>/dev/null || echo "medium")

  STORY_ID=$(jq -r '
    [.userStories[] | select(.passes == false)]
    | sort_by(.priority)
    | .[0].id // "?"
  ' "$PRD_FILE" 2>/dev/null || echo "?")

  STORY_TITLE=$(jq -r '
    [.userStories[] | select(.passes == false)]
    | sort_by(.priority)
    | .[0].title // ""
  ' "$PRD_FILE" 2>/dev/null || echo "")

  STORY_RESEARCH=$(jq -r '
    [.userStories[] | select(.passes == false)]
    | sort_by(.priority)
    | .[0].research // false
  ' "$PRD_FILE" 2>/dev/null || echo "false")

  STORY_RESEARCH_QUERY=$(jq -r '
    [.userStories[] | select(.passes == false)]
    | sort_by(.priority)
    | .[0].research_query // ""
  ' "$PRD_FILE" 2>/dev/null || echo "")

  STORY_RESEARCH_MODEL=$(jq -r '
    [.userStories[] | select(.passes == false)]
    | sort_by(.priority)
    | .[0].research_model // ""
  ' "$PRD_FILE" 2>/dev/null || echo "")

  # Use story-level research model if set, else global default
  if [ -n "$STORY_RESEARCH_MODEL" ] && [ "$STORY_RESEARCH_MODEL" != "null" ]; then
    EFFECTIVE_RESEARCH_MODEL="$STORY_RESEARCH_MODEL"
  else
    EFFECTIVE_RESEARCH_MODEL="$RESEARCH_MODEL"
  fi

  update_status "$i" "$STORY_ID" "$STORY_MODEL/$STORY_EFFORT" "running: $STORY_TITLE"

  # Research phase (before spawning the agent)
  rm -f "$RESEARCH_CONTEXT"
  if [ "$STORY_RESEARCH" = "true" ] && [ -n "$STORY_RESEARCH_QUERY" ]; then
    run_research "$STORY_ID" "$STORY_RESEARCH_QUERY" "$EFFECTIVE_RESEARCH_MODEL"
  fi

  if [[ "$TOOL" == "amp" ]]; then
    echo "  Story: $STORY_ID | Model: $STORY_MODEL (amp)"
    PROMPT=$(build_prompt "$STORY_ID")
    OUTPUT=$(echo "$PROMPT" | amp --dangerously-allow-all 2>&1 | tee /dev/stderr) || true
  else
    if [[ "$STORY_MODEL" == openrouter:* ]]; then
      OR_MODEL="${STORY_MODEL#openrouter:}"

      if [ -z "${OPENROUTER_API_KEY:-}" ]; then
        echo "  WARNING: OPENROUTER_API_KEY not set. Falling back to claude-sonnet-4-6"
        CLAUDE_MODEL="claude-sonnet-4-6"
        echo "  Story: $STORY_ID | Model: $STORY_MODEL → $CLAUDE_MODEL | Effort: $STORY_EFFORT (fallback)"
        PROMPT=$(build_prompt "$STORY_ID")
        OUTPUT=$(echo "$PROMPT" | env -u CLAUDECODE claude --model "$CLAUDE_MODEL" --effort "$STORY_EFFORT" \
                 --dangerously-skip-permissions --print 2>&1 | tee /dev/stderr) || true
      else
        echo "  Story: $STORY_ID | Model: $OR_MODEL | Effort: $STORY_EFFORT (OpenRouter)"
        PROMPT=$(build_prompt "$STORY_ID")
        OUTPUT=$(echo "$PROMPT" | ANTHROPIC_BASE_URL="https://openrouter.ai/api/v1" \
                 ANTHROPIC_API_KEY="$OPENROUTER_API_KEY" \
                 env -u CLAUDECODE claude --model "$OR_MODEL" --effort "$STORY_EFFORT" \
                 --dangerously-skip-permissions --print 2>&1 | tee /dev/stderr) || true
      fi
    else
      case "$STORY_MODEL" in
        opus)   CLAUDE_MODEL="claude-opus-4-6" ;;
        haiku)  CLAUDE_MODEL="claude-haiku-4-5-20251001" ;;
        *)      CLAUDE_MODEL="claude-sonnet-4-6" ;;
      esac

      echo "  Story: $STORY_ID | Model: $STORY_MODEL → $CLAUDE_MODEL | Effort: $STORY_EFFORT (Claude)"
      PROMPT=$(build_prompt "$STORY_ID")
      OUTPUT=$(echo "$PROMPT" | env -u CLAUDECODE claude --model "$CLAUDE_MODEL" --effort "$STORY_EFFORT" \
               --dangerously-skip-permissions --print 2>&1 | tee /dev/stderr) || true
    fi
  fi

  # Clean up research context after use
  rm -f "$RESEARCH_CONTEXT"

  update_status "$i" "$STORY_ID" "$STORY_MODEL/$STORY_EFFORT" "done"

  if echo "$OUTPUT" | grep -q "<promise>COMPLETE</promise>"; then
    update_status "$i" "-" "-" "COMPLETE"
    echo ""
    echo "Ralph completed all tasks!"
    echo "Completed at iteration $i of $MAX_ITERATIONS"
    exit 0
  fi

  echo "Iteration $i complete. Continuing..."
  sleep 2
done

update_status "$MAX_ITERATIONS" "-" "-" "MAX_ITERATIONS_REACHED"
echo ""
echo "Ralph reached max iterations ($MAX_ITERATIONS) without completing all tasks."
echo "Check $PROGRESS_FILE for status."
exit 1
