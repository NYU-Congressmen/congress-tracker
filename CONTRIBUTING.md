# Contributing

This file covers working on Congress Tracker once your laptop is set up. If you have not set it up yet, follow [SETUP.md](SETUP.md) first, and see the [README](README.md) for what the project is and where it stands.

## Branches

The repo has three kinds of branch. `main` holds the version that is ready to demo, and it only changes when `develop` is merged into it before a milestone. `develop` is where everyone's finished work comes together, and it is the default branch, so new pull requests target it automatically. Each teammate also has a personal branch (`dev/adam`, `dev/akbar` or `dev/abdrahman`) that lasts the whole project and holds their work in progress.

A git hook installed by `npm run setup` refuses any push straight to `main` or `develop`, because the repo is private on a free plan and GitHub cannot enforce that rule itself. Do not bypass it with `--no-verify`. If a push fails with "Direct pushes to main are blocked" or the same message for develop, you committed on a shared branch. Carry those commits to your own branch with `git switch dev/your-name` followed by `git merge develop` (or `git merge main`), then push and open a pull request.

## Daily workflow

1. Start on your branch and pick up anything you pushed from another computer.

   ```bash
   git switch dev/your-name
   git pull
   ```

2. Bring in the work your teammates have merged into `develop`. Do this at the start of each session and again before opening a pull request, because small, frequent merges produce fewer conflicts than one large merge at the end.

   ```bash
   git fetch origin
   git merge origin/develop
   ```

3. Make your changes and check them before committing.

   ```bash
   npm run lint
   npm test
   git add -A
   git commit -m "Add bill search endpoint"
   git push
   ```

   The first push from a new clone may ask you to set the upstream branch, which `git push -u origin dev/your-name` does once.

4. Open a pull request from your branch into `develop`, either on GitHub or from the terminal with the GitHub CLI.

   ```bash
   gh pr create --base develop --fill
   ```

   Fill in the template's Summary, Roadmap item and Testing sections, then wait for the CI checks to pass and for a teammate to review the change.

5. Merge the pull request on GitHub with the "Create a merge commit" button, which is the only merge option the repo allows. After merging, keep working on the same branch and continue from step 1.

## Commands

All commands run from the repo root.

| Command | What it does |
|---|---|
| `npm run setup` | Installs uv if needed and every dependency, turns on the git hooks, creates `.env`, saves your API key and switches to your branch |
| `npm run dev` | Runs the API and frontend together and stops both when either exits |
| `npm run dev:be` / `npm run dev:fe` | Runs only the API or only the frontend |
| `npm run sync` | Checks the Congress.gov key and copies current members and 119th-Congress bill summaries when a database is configured |
| `npm test` | Runs the setup scripts, backend (pytest) and frontend (Vitest) tests |
| `npm run lint` | Checks Python with ruff and TypeScript with oxlint |
| `npm run format` | Reformats the Python code with ruff |
| `npm run db:migrate` | Applies pending database migrations |
| `npm run db:revision -- "describe the change"` | Creates a new migration file |
| `npm run build` | Builds the frontend for production |

## Code organization

New endpoints go in a module under `backend/app/routes/` and are registered in `backend/app/main.py` under the `/api` prefix, which the Vite dev server forwards to the backend. Frontend functions that call the backend belong in `frontend/src/api/`. Each change should come with tests next to the existing ones in `backend/tests/` or beside the component in `frontend/src/`.

Code that talks to Congress.gov lives in `backend/app/sync/`. The list sync in `bills.py` and `members.py` fills the tables cheaply, and `cache.py` fetches a single bill's or member's details when an endpoint needs them, so new endpoints should read from the database and call the cache rather than Congress.gov directly. Tests that need a database use the `db` fixture in `backend/tests/conftest.py`, and [SETUP.md](SETUP.md#database-tests) explains how to run them locally.

Public response models live in `backend/app/models.py` and appear in FastAPI's `/docs` and `/openapi.json`. Update them alongside endpoint changes so frontend code depends on a documented response rather than every column in a database row. The Congress.gov client has a synchronous interface and owns an event loop for cancellable HTTP requests, so use it from synchronous routes and jobs.

To add a package, run `uv add --directory backend package-name` for Python or `npm install -w frontend package-name` for the frontend. Commit the updated lock file (`backend/uv.lock` or `package-lock.json`) with the change, so everyone installs the same versions.

## API responses

Bill lists return `total`, `page`, `limit` and `data`, ordered by latest action date descending and then bill ID ascending. The secondary order resolves date ties, although a sync that changes records between requests can still move records between pages. Member profiles include sponsored bills from the configured current Congress only. Bill detail actions retain Congress.gov's supplied sequence, including actions sharing a date.

Both detail endpoints include a `cache` object. `complete` means the bill's details and actions, or the member's entire sponsored-bill list, were fetched successfully. It does not guarantee that the upstream source itself is complete. `stale` means that the detail version is behind the latest recorded bill version or that sponsored bills are older than a day, and is also true for a missing cache. `refreshed_at` is the last successful local fetch time. `refresh_failed` records an unsuccessful refresh, and `retry_after` gives the earliest retry time. Successful refreshes clear the failure state.

An HTTP 200 response can contain an incomplete bill summary or a partial set of known sponsored bills when refresh is unavailable. Use `cache.complete` to distinguish that result from a successfully fetched empty history or sponsored list. A complete stale result can still be displayed with its fetch time. Without a configured key, endpoints serve stored data and leave incomplete caches marked as such without calling Congress.gov. An uncached bill returns 404 when it cannot be found and 502 when an upstream error prevents fetching it.

Interactive refreshes pass a five-second budget to `CongressClient`, shared across every upstream request in that refresh. Each request may wait only for the time left in that budget, so a stalled connection ends at the deadline, and database writes begin only after upstream fetching succeeds. The budget covers upstream work rather than the database or the entire endpoint. Failed refreshes of stored resources write a one-minute retry deadline to Postgres, so cooldowns survive process restarts and are shared by workers. Simultaneous first requests can still duplicate upstream fetching. A bill that Congress.gov reports as missing has no stored row, so each server process remembers it in memory for ten minutes instead. The list sync uses the client's ordinary per-request timeout without an overall five-second budget.

Bill stages are `introduced`, `committee`, `passed_one_chamber`, `passed_both_chambers`, `to_president` and `became_law`. The `passed_house` and `passed_senate` flags accumulate independently in every upsert, so Senate-originated bills follow the same rules as House-originated bills. These flags describe observed passage and do not prove that both chambers approved identical text. Text-derived stages remain approximate even with full action history, and retaining milestones also retains false-positive inferences until they are corrected explicitly.

## Merge strategy

Squash merging turns a pull request into one new commit on `develop`, which leaves your dev branch holding the original commits that `develop` does not recognise. Because the dev branches last the whole project, the next merge of `develop` into your branch would conflict with your own earlier work. A merge commit keeps the shared history, so `git merge origin/develop` stays clean.

## Merge conflicts

When `git merge origin/develop` reports a conflict, git marks the conflicting sections in each affected file between `<<<<<<<` and `>>>>>>>` lines. Run `git status` to see which files have conflicts. Edit each one to keep the correct code and delete the markers, then stage it with `git add`. Once every file is staged, `git commit` completes the merge and `git push` sends it.

```bash
git status
git add path/to/file
git commit
git push
```

If a conflict is confusing, run `git merge --abort` to return to where you were and ask the teammate whose code it touches.

## Releases

Before each milestone, one person opens a pull request from `develop` into `main` and merges it once CI passes, so `main` always holds the demo version.

```bash
gh pr create --base main --head develop --title "Release for milestone name"
```

## Database migrations

Create a migration with `npm run db:revision -- "describe the change"` and write the SQL in its `upgrade()` function using `op.execute`. The generated file is formatted automatically with Ruff. While everyone shares one Supabase database, only the author runs `npm run db:migrate`, and only after the pull request is merged, so two people never change the shared schema at the same time. Starting the development servers never applies migrations.

PR #6 includes migrations `803cfe036e6c` and `b71e8a40d192`, which must both be applied after merge before using the new endpoints. The latter adds cache versions, retry deadlines and independent chamber flags, and converts legacy `passed_house` and `passed_senate` stages to `passed_one_chamber`. It preserves existing records, action history and fetch timestamps, while caches lacking an upstream version are refreshed on their next eligible view. Its downgrade restores the old status vocabulary, which cannot represent two independent chamber flags.

## Branch protection

Making the repo public unlocks GitHub's own branch protection. An admin can then open Settings, then Branches, and add a rule for `main` and `develop` that requires a pull request and passing CI checks. The local hook can stay as an early warning.
