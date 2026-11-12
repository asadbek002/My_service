---
name: save
description: Save the work — commit every change in the repo and push it to GitHub (origin main). Use when the user types /save or asks to save, commit or push.
---

# /save — commit and push

Save the current state of the repository to GitHub.

1. Run `git status --short`. If nothing changed and the branch is not ahead of `origin/main`, say so in one line (in Uzbek) and stop.
2. Look at the diff (`git diff --stat`, then the changed lines where needed) so the message describes the change.
   Never commit `.env`, `.env.*`, `backups/`, `uploads/` or other secrets; if one is staged, unstage it and tell the user.
3. Before committing code changes, run the fast checks: `pnpm typecheck`. If it fails, fix the error or ask the user;
   do not push broken code. (Text-only changes, e.g. docs, need no check.)
4. `git add -A` and commit with a short English subject line (what changed), a body if useful, and the
   attribution lines from the session's system reminder at the end.
5. Push: `git push -u origin main`. On a network error retry up to 4 times (2s, 4s, 8s, 16s). If the push is
   rejected because the remote moved, `git pull --no-rebase origin main`, resolve, re-run the checks, push again.
6. Reply in Uzbek, briefly: the commit hash and subject, and that it is on GitHub. If the change needs a deploy,
   give the deploy command from CLAUDE.md (add `db:migrate` only when a new migration was committed).
