# wcr-site: rules for Claude sessions

## Deploy budget (read before pushing)

Netlify deploys this site on every push to `main`, and each production deploy costs 15 credits. The plan includes 1,000 credits a month (about 66 deploys). In November 2026 the credits ran out in two weeks because sessions pushed many small commits, and deploys froze until the next cycle.

Rules:

1. **One push per task.** Commit as often as you like locally, then push once when the task is done. A backfill of 30 pages is one push, not 30.
2. **Target: no more than 2 deploys a day** across all sessions and jobs. If a task truly needs more, say so to Ryan first.
3. **Intermediate pushes** that must happen before the work is ready get `[skip netlify]` in the commit message.
4. **No deploy needed for non-site files.** `netlify.toml` already skips the build when a push only touches `docs/`, `.claude/`, `.github/`, `emails/`, `scripts/email/`, `README.md` or `CLAUDE.md`. Keep working notes, reports and specs in those places.
5. **Preview without deploying.** Check work with `npm run build` and `npm run audit` locally. Push a draft only when Ryan needs a live preview URL.
6. If a push does not go live, check the credit balance at Netlify (Usage & billing) before retrying. Do not push again to "kick" a deploy.

## Copy

Tight, accurate copy. No em dashes. Minimal flourishes.
