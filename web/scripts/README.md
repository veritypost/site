# web/scripts

Operational scripts for the Next.js web app. Use `deploy.sh` for normal
pushes; use `emergency-rollback.sh` only when the Vercel rollback UI is
unavailable.

| Script                  | Purpose                                             |
| ----------------------- | --------------------------------------------------- |
| `deploy.sh`             | Push current `main` to origin; Vercel auto-deploys. |
| `emergency-rollback.sh` | Revert the most recent commit on `main` and push.   |

Both scripts assume you are on `main` with a clean working tree. Run
them from the repo root or anywhere inside the worktree.
