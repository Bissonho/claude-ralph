#!/bin/bash
# research.sh — Query an AI model via OpenRouter and return markdown
# Usage: ./research.sh "query text" [model] [api_key]
# Deps: curl, jq, OPENROUTER_API_KEY env var (or pass as 3rd arg)
# Output: markdown text to stdout

set -euo pipefail

QUERY="${1:-}"
MODEL="${2:-perplexity/sonar-pro}"
API_KEY="${3:-${OPENROUTER_API_KEY:-}}"

if [ -z "$QUERY" ]; then
  echo "Usage: $0 \"query text\" [model] [api_key]" >&2
  exit 1
fi

if [ -z "$API_KEY" ]; then
  echo "Error: OPENROUTER_API_KEY not set and no api_key argument provided." >&2
  echo "Set it with: export OPENROUTER_API_KEY=sk-or-..." >&2
  exit 1
fi

# Escape query for JSON
ESCAPED_QUERY=$(printf '%s' "$QUERY" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')

RESPONSE=$(curl -s https://openrouter.ai/api/v1/chat/completions \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -H "HTTP-Referer: https://github.com/claude-ralph" \
  -d "{
    \"model\": \"$MODEL\",
    \"messages\": [{
      \"role\": \"user\",
      \"content\": $ESCAPED_QUERY
    }]
  }")

# Extract content, fallback to full response on error
CONTENT=$(echo "$RESPONSE" | jq -r '.choices[0].message.content // empty' 2>/dev/null)

if [ -z "$CONTENT" ]; then
  ERROR=$(echo "$RESPONSE" | jq -r '.error.message // "Unknown error"' 2>/dev/null || echo "Failed to parse response")
  echo "Error from OpenRouter: $ERROR" >&2
  echo "Full response: $RESPONSE" >&2
  exit 1
fi

echo "$CONTENT"
