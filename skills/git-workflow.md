# Skill: Git Workflow

## Branches
```
main                 ← Architect may commit + push directly (George authorized). Never force-push.
  dev/[topic]        ← optional topic branch for large/risky changes
  design/[topic]     ← optional
```
Use a topic branch + review when a change is large, risky, or you want George to look before it lands.
Otherwise commit to `main`.

## Commits
- Format: `area: short imperative — detail`
  (e.g. `scan: add Gemini Flash-Lite primary provider — Claude fallback on low confidence`).
- End the message body with:
  ```
  Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
  ```
- Keep commits coherent — one logical change. Update todo/memory/lessons in the same or an immediately
  following commit (post-commit housekeeping).

## Guardrails (never without explicit George approval)
- No `--force` / force-push to `main`.
- No `--no-verify` / `--no-gpg-sign` (don't skip hooks).
- Flag destructive ops (`reset --hard`, history rewrite, branch delete) before running.

## This repo's remote
`origin = https://github.com/GeorgiKostov/eventmap.git`. The **first push needs interactive GitHub
auth** (was not available in the build sandbox): `git push -u origin main`, or set up `gh auth login`
/ a PAT once. After that the macOS keychain remembers it.
