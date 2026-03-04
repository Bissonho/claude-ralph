# Atomic Commit Rules

## Commit Types

| Type | When to use |
|------|-------------|
| `test:` | Adding or modifying tests (RED phase) |
| `feat:` | New functionality (GREEN phase) |
| `fix:` | Bug fix |
| `refactor:` | Code improvement without behavior change |
| `docs:` | Documentation only |
| `security:` | Security hardening |
| `chore:` | Maintenance, config, tooling |

## Format

```
type: [Story ID] - short description

Co-Authored-By: Claude <noreply@anthropic.com>
```

## Rules

- **Never mix types** in a single commit (e.g., no test + feat together)
- **Every commit must pass CI** — run your stack's quality checks before committing
- **TDD stories** produce at minimum 2 commits: `test:` then `feat:` (optionally `refactor:`)
- **Non-TDD stories** (scaffold, config, frontend): single `feat:` commit is acceptable

## Size Limits

- File exceeding **300 LOC** → extract into smaller files before committing
- Function exceeding **50 LOC** → break into smaller functions
- If a commit touches more than **10 files**, consider splitting into smaller commits

## Commit Sequence for TDD Stories

```
test: [US-102] - add config parsing tests
feat: [US-102] - implement config package
refactor: [US-102] - extract validation helper  (optional)
```

The test commit MUST compile (build passes) even though tests fail.
The feat commit makes all tests pass.
