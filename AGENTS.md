# Agent Rules

These rules are mandatory for any automated or human-assisted commit in this repository.

## Commit Cleanliness Contract

- Use conventional commits for the subject line.
- Keep one logical change per commit.
- Commit body must include:
  - `planned-date: YYYY-MM-DD`
  - `why:`
  - `what:`
  - `verification:`
- `planned-date` must match `docs/commit-plan.md` for milestone subjects.
- Set both author and committer date to `planned-date`.
- `Co-authored-by` trailers are forbidden.
- AI trace text is forbidden in commit messages (for example: `ChatGPT`, `Claude`, `OpenAI`, `Anthropic`, `Copilot`, `AI-generated`).

## Required Setup

Run this once per clone:

```powershell
npm run setup:hooks
```

This enables:
- `.githooks/commit-msg`: blocks non-compliant commit messages.
- `.githooks/pre-push`: blocks pushes with non-compliant commit metadata/history.

## Backdated Commit Command

Use this pattern to guarantee date correctness:

```powershell
$d = "2026-01-02"
$env:GIT_AUTHOR_DATE = "$d`T12:00:00Z"
$env:GIT_COMMITTER_DATE = "$d`T12:00:00Z"
git commit
```

Clear env vars afterward:

```powershell
Remove-Item Env:GIT_AUTHOR_DATE -ErrorAction Ignore
Remove-Item Env:GIT_COMMITTER_DATE -ErrorAction Ignore
```
