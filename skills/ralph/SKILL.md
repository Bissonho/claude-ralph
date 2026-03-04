---
name: ralph
description: "Convert PRDs to prd.json format for the Ralph autonomous agent system. Use when you have an existing PRD and need to convert it to Ralph's JSON format. Triggers on: convert this prd, turn this into ralph format, create prd.json from this, ralph json."
user-invocable: true
---

# Ralph PRD Converter

Converts existing PRDs to the prd.json format that Ralph uses for autonomous execution.

---

## The Job

Take a PRD (markdown file or text) and convert it to `scripts/ralph/prd.json` (or the project's `--prd-dir` path).

---

## Output Format

```json
{
  "project": "My Project",
  "branchName": "ralph/[feature-name-kebab-case]",
  "description": "[Feature description]",
  "userStories": [
    {
      "id": "US-001",
      "title": "[Story title]",
      "description": "As a [user], I want [feature] so that [benefit]",
      "acceptanceCriteria": [
        "Criterion 1",
        "Quality gate 1 passes",
        "Quality gate 2 passes"
      ],
      "priority": 1,
      "passes": false,
      "tddType": "testable",
      "effort": "medium",
      "model": "sonnet",
      "research": false,
      "research_query": "",
      "research_model": "perplexity/sonar-pro",
      "notes": ""
    }
  ]
}
```

### Required Fields Per Story

| Field               | Type     | Description                                       |
| ------------------- | -------- | ------------------------------------------------- |
| `id`                | string   | Sequential: US-001, US-002, etc.                  |
| `title`             | string   | Short imperative description                      |
| `description`       | string   | User story format                                 |
| `acceptanceCriteria`| string[] | Must include quality gates                        |
| `priority`          | number   | Dependency-based order                            |
| `passes`            | boolean  | Always `false` initially                          |
| `tddType`           | string   | "testable", "scaffold", "frontend", or "infra"    |
| `effort`            | string   | "low", "medium", or "high"                        |
| `model`             | string   | See Model Selection table below                   |
| `research`          | boolean  | `true` to run a research query before this story  |
| `research_query`    | string   | The query sent to the research model              |
| `research_model`    | string   | OpenRouter model for research (default: perplexity/sonar-pro) |
| `notes`             | string   | Context, hints, gotchas for the agent             |

---

## Story Size: The Number One Rule

**Each story must be completable in ONE Ralph iteration (one context window).**

### Right-sized stories:

- Add a database table or migration
- Create a backend query/mutation/action
- Add a state management bloc/store with events/states
- Add a page with repository wiring

### Too big (split these):

- "Build the entire dashboard" → Split into: backend queries, domain models, state management, page
- "Full auth system" → Split into: schema, backend functions, state management, login page
- "Deterministic engine" → Split into: schema, seed data, engine logic, mutation, UI integration

**Rule of thumb:** If you cannot describe the change in 2-3 sentences, it is too big.

---

## Story Ordering: Dependencies First

1. **Schema** — database tables, indexes, fields
2. **Seed data** — populate tables with initial data
3. **Backend deploy** — deploy and run seeds
4. **Backend functions** — queries, mutations, actions
5. **Domain models** — data models
6. **Data layer** — repositories
7. **State management** — BLoCs, stores, controllers
8. **Presentation** — pages, widgets, components
9. **Polish** — UX improvements, error handling, visual tweaks

---

## TDD Classification

Assign a `tddType` to each story:

| Classification | TDD? | Criteria                                                                             |
| -------------- | ---- | ------------------------------------------------------------------------------------ |
| **testable**   | YES  | Business logic with unit tests (blocs, services, repositories)                       |
| **scaffold**   | NO   | Project setup: schema changes, config files, type definitions                        |
| **frontend**   | NO   | UI pages, widgets, layouts — lint/typecheck is the quality gate                      |
| **infra**      | NO   | Schema/seeds, deploy configs, CI/CD                                                  |

For **testable** stories, acceptance criteria MUST include:
- Specific test file name
- What scenarios to cover (defaults, errors, edge cases)
- Test command as a quality gate

---

## Model Selection

### Claude models (via Anthropic API)

| Model    | When to use                                                                          |
| -------- | ------------------------------------------------------------------------------------ |
| `opus`   | Complex: multi-file architecture, engine logic, API integrations, 8+ files           |
| `sonnet` | Standard: CRUD pages, state management, forms, config — most stories                 |
| `haiku`  | Very simple: 1-2 files, rename, constants, minor fixes                               |

### OpenRouter models (prefix with `openrouter:`)

| Category       | Model                                        | Use                                       |
| -------------- | -------------------------------------------- | ----------------------------------------- |
| Research       | `perplexity/sonar-pro`                       | Web search, recent docs, best practices   |
| Reasoning      | `google/gemini-2.0-flash-thinking-exp`       | Architecture, deep analysis               |
| Implementation | `anthropic/claude-sonnet-4-5`                | Stories (same as `sonnet` via OpenRouter) |
| Complex        | `anthropic/claude-opus-4-5`                  | Large, difficult stories                  |
| Fast/cheap     | `anthropic/claude-haiku-4-5-20251001`        | Trivial stories, CRUD                     |
| Code           | `deepseek/deepseek-r1`                       | Code-intensive generation                 |

Use `openrouter:model/name` syntax in the `model` field (e.g., `openrouter:perplexity/sonar-pro`).

---

## Research Support

Set `research: true` on any story where up-to-date information would help:

```json
{
  "id": "US-005",
  "title": "Integrate payment provider",
  "research": true,
  "research_query": "Best practices for Apple In-App Purchase integration in Flutter 2025",
  "research_model": "perplexity/sonar-pro",
  "model": "opus"
}
```

Ralph will call `research.sh` before spawning the implementation agent, injecting the result into the prompt context.

**Good candidates for research:**
- Third-party API integrations (payment, auth, analytics)
- Platform-specific features (iOS/Android)
- Recently-changed frameworks or SDKs
- Security-sensitive implementations

---

## Effort Selection

| Effort   | When to use                                              |
| -------- | -------------------------------------------------------- |
| `low`    | Simple changes, 1-3 files, clear implementation path     |
| `medium` | Standard features, 3-8 files, some decisions needed      |
| `high`   | Complex features, 8+ files, architecture decisions, APIs |

---

## Conversion Rules

1. Each user story becomes one JSON entry
2. IDs: Sequential (US-001, US-002, etc.)
3. Priority: Based on dependency order (lowest = first)
4. All stories: `passes: false`
5. branchName: `ralph/` prefix, kebab-case
6. Always add quality gates to acceptance criteria
7. Assign `model` based on complexity (default: `sonnet`)
8. Assign `tddType` based on classification
9. Assign `effort` based on scope
10. Set `research: true` for stories needing up-to-date context
11. Output: `scripts/ralph/prd.json` (or project's prd-dir)
