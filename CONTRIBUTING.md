# Contributing

This file covers working on Pull once your laptop is set up. If you have not set it up yet, follow [SETUP.md](SETUP.md) first, and see the [README](README.md) for what the project is and where it stands.

## Branches

The repo has three kinds of branch. `main` holds the version that is ready to demo, and it only changes when `develop` is merged into it before a milestone. `develop` is where everyone's finished work comes together, and it is the default branch, so new pull requests target it automatically. Each teammate also has a personal branch (`dev/adam`, `dev/akbar` or `dev/abdrahman`) that lasts the whole project and holds their work in progress.

A git hook installed by `npm run setup` refuses any push straight to `main` or `develop`, because the repo is private on a free plan and GitHub cannot enforce that rule itself. Do not bypass it with `--no-verify`. If a push fails with "Direct pushes to main are blocked" or the same message for develop, you committed on a shared branch. Run `git get-latest`, which moves those commits to your own branch and resets the shared one to GitHub's copy, then open a pull request.

## Daily workflow

1. Start every session by bringing your branch up to date.

   ```bash
   git get-latest
   ```

   If you are on `main` or `develop`, the command first switches you to your branch and carries over any commits made there. It then saves your uncommitted work as a commit on your branch, merges anything you pushed from another computer and everything your teammates have merged into `develop`, updates the frontend and backend packages and pushes your branch to GitHub. Run it again before opening a pull request, because small, frequent merges produce fewer conflicts than one large merge at the end. `npm run get-latest` does exactly the same, and running it or `npm install` once adds `git get-latest` to a clone that does not have it yet.

2. Make your changes and check them before committing.

   ```bash
   npm run lint
   npm test
   git add -A
   git commit -m "Add bill search endpoint"
   git push
   ```

   The first push from a new clone may ask you to set the upstream branch, which `git push -u origin dev/your-name` does once.

3. Open a pull request from your branch into `develop`, either on GitHub or from the terminal with the GitHub CLI.

   ```bash
   gh pr create --base develop --fill
   ```

   Fill in the template's Summary, Roadmap item and Testing sections, then wait for the CI checks to pass and for a teammate to review the change.

4. Merge the pull request on GitHub with the "Create a merge commit" button, which is the only merge option the repo allows. After merging, keep working on the same branch and continue from step 1.

## Commands

All commands run from the repo root.

| Command | What it does |
|---|---|
| `npm run setup` | Installs uv if needed and every dependency, turns on the git hooks, adds `git get-latest`, creates `.env`, saves your API key and switches to your branch |
| `git get-latest` or `npm run get-latest` | Brings your branch up to date with `develop` and pushes it, as described in the daily workflow |
| `npm run dev` | Runs the API and frontend together and stops both when either exits |
| `npm run dev:be` / `npm run dev:fe` | Runs only the API or only the frontend |
| `npm run sync` | Checks the Congress.gov key and, when a database is configured, copies current members, 119th-Congress bills, their CRS summaries and changed members' office contacts, then the cosponsors, committees, related bills and House votes of every bill someone tracks or reviews. With a Bluesky account set up, it also finds posts carrying share links. The daily sync workflow runs the same command |
| `uv run --directory backend python -m app.ai.embeddings` | Saves missing or changed bill and topic embeddings. `--limit-bills N` caps the bill batch for a sample run |
| `npm test` | Runs the setup scripts, backend (pytest) and frontend (Vitest) tests |
| `npm run lint` | Checks Python with ruff and TypeScript with oxlint |
| `npm run format` | Reformats the Python code with ruff |
| `npm run db:migrate` | Applies pending database migrations |
| `npm run db:revision -- "describe the change"` | Creates a new migration file |
| `npm run build` | Builds the frontend for production |

## Code organization

New endpoints go in a module under `backend/app/routes/` and are registered in `backend/app/main.py` under the `/api` prefix, which the Vite dev server forwards to the backend. Frontend functions that call the backend belong in `frontend/src/api/`. Each change should come with tests next to the existing ones in `backend/tests/` or beside the component in `frontend/src/`.

`backend/app/db.py` keeps a small pool of database connections, because opening a Supabase connection takes longer than most queries. Keep using `with connect() as conn`, which commits on success and rolls back on error.

Routes that act for a user depend on `current_uid` in `backend/app/auth.py`. It verifies the Firebase ID token for the configured project and returns the UID for the phone session. `PUT /api/account` uses the same verification to create or update the account with Firebase's verified phone number. Route tests use FastAPI dependency overrides, and the account tests cover the token checks and database path with a test verifier.

Structured model calls go through `ask` in `backend/app/ai/service.py`, which answers from the `ai_results` cache when it can and logs each real call in `ai_calls` with its tokens and cost. The cache key covers the feature, prompt version, model and exact messages, so changed input regenerates by itself. Bump a feature's prompt version when its prompt changes. A failed call is logged and raised, never cached.

The embedding job uses `LLM_API_KEY` and `LLM_BASE_URL` for an endpoint that serves OpenAI `text-embedding-3-small`. It stores 1,536-dimensional vectors for the topic names and keywords and for bill titles with their latest CRS summary where available. Embedding batches log token counts and cost in `ai_calls`. The job runs after the embedding migration and can be rerun to fill new or changed inputs after a sync. The shared database needs the embedding migration before the first release of the semantic feed. Cloud Run reads saved vectors without a model key.

Code that talks to Congress.gov lives in `backend/app/sync/`. The list sync in `bills.py`, `members.py` and `summaries.py` fills the tables cheaply, and `cache.py` fetches a single bill's or member's details when an endpoint needs them, so new endpoints should read from the database and call the cache rather than Congress.gov directly. Tests that need a database use the `db` fixture in `backend/tests/conftest.py`, and [SETUP.md](SETUP.md#database-tests) explains how to run them locally.

Public response models live in `backend/app/models.py` and appear in FastAPI's `/docs` and `/openapi.json`. Update them alongside endpoint changes so frontend code depends on a documented response rather than every column in a database row. The Congress.gov client has a synchronous interface and owns an event loop for cancellable HTTP requests, so use it from synchronous routes and jobs.

To add a package, run `uv add --directory backend package-name` for Python or `npm install -w frontend package-name` for the frontend. Commit the updated lock file (`backend/uv.lock` or `package-lock.json`) with the change, so everyone installs the same versions.

## Pull endpoints

These endpoints serve Pull's own features on top of the legislative data.

### Who decides a bill

`GET /api/bills/{congress}/{type}/{number}/graph` returns a bill's cosponsors, the committees and subcommittees holding it with each one's latest activity, and its related bills. Withdrawn cosponsors come last and carry a `withdrawn_date`. Each related bill has `stored`, which says whether Pull has that bill to link to. The first request fetches all three from Congress.gov within the five-second budget, and later requests read the stored copy until the bill's update date changes. The daily sync refreshes them for every bill someone tracks or reviews. The response carries the same `cache` object as the detail endpoints.

### What people on Pull think

`GET /api/bills/{congress}/{type}/{number}/responses` counts stances on a bill as `counts.support`, `counts.oppose` and `counts.unsure`, with their `total` and a `label` for the page to show. Every account is phone-verified, so these are people who chose to respond, not a sample of the public. `?state=NY` limits the counts to users whose saved district is in that state, and `&district=12` to one district. Only a Census address match saves a district on the account (`PUT /api/account/district`); picking one on the map or by number calls `DELETE /api/account/district`, so such users are counted only without a state filter. An at-large seat has no district number, so its constituents are counted with the state alone. Reviews their authors hid are left out.

### Shared reviews and reports

`GET /api/bills/{congress}/{type}/{number}/reviews` pages through the reviews whose authors set `share_publicly`, most recently edited first. That choice is separate from `consent_to_share`, which only includes a review in the Constituent Signal brief for the author's office, so agreeing to the brief never lists a review publicly. Each carries a `review_id` and the state and district its author saved, never a name or phone number. `PUT .../review/visibility` with `{"hidden": true}` lets the author hide their own review from that list and from response counts, and `{"hidden": false}` shows it again. Editing a hidden review keeps it hidden, and `GET .../review` reports `hidden`.

Anyone can `POST /api/reviews/{review_id}/reports` with a `reason` (`spam`, `harassment`, `misinformation`, `personal_info` or `other`) and optional `details`, signed in or not. A signed-in person's report counts once per review, and reports from three different signed-in people withhold the review from the shared list until the team clears them in `review_reports`. Visitors' reports are recorded but never withhold a review on their own, because one visitor could send any number of them. Authors cannot report their own review.

### House votes

`GET /api/bills/{congress}/{type}/{number}/house-votes` lists a bill's House roll-call votes, oldest first. Each has its question, result, `totals` counting every member's position exactly as the Clerk recorded it (`Yea`, `Nay`, `Aye`, `No`, `Present` or `Not Voting`), and `positions` naming each member with their district when Pull has them stored. `?bioguide_id=` narrows `positions` to one member, so a page can put a representative's vote beside what Pull users said, while `totals` still counts everyone. The sync reads a followed bill's actions again only after the bill changes and fetches each vote's positions once, since a recorded vote never changes. Until then `positions_complete` is false. Congress.gov's House vote data covers the 118th and 119th Congresses.

### Share links

`PUT /api/bills/{congress}/{type}/{number}/review/shares/{platform}` returns the signed-in author's link for sharing their review on one platform (`bluesky`, `x`, `mastodon`, `threads`, `instagram`, `tiktok`, `facebook`, `linkedin` or `other`), such as `https://congress-pull.web.app/s/k3Xa9QpL`. Asking again for the same platform returns the same link, so its visits keep adding up. Sharing needs a saved review. `GET .../review/shares` returns `shared_to`, each link with its `visits`, and `posted_to`, the live posts found carrying one of the links. Shared reviews list their `posted_to` platforms too.

A link at `/s/{code}` serves a page with the bill's title and the start of its CRS summary, or its latest action, as Open Graph tags, which apps read to draw a preview card. People's browsers follow the page's refresh to the bill. Only people count as visits, so preview robots such as Twitterbot, facebookexternalhit and Bluesky's Cardyb are left out by their user agent. Firebase Hosting sends `/s/{code}` to the API through the same rewrite as `/api` and `/mcp`, and the Vite dev server forwards `/s/` too. `PUBLIC_SITE_URL` sets the address links point to, `https://congress-pull.web.app` by default.

The sync signs in as Pull's own Bluesky account with `BLUESKY_HANDLE` and an app password in `BLUESKY_APP_PASSWORD`, because Bluesky's post search needs an account. It searches for posts linking to each share link made in the last 30 days, records each post once in `post_cards` and skips the search when the account is not set up.

## API responses

Bill lists return `total`, `page`, `limit` and `data`, ordered by latest action date descending and then bill ID ascending. The secondary order resolves date ties, although a sync that changes records between requests can still move records between pages. Member profiles include sponsored bills from the configured current Congress only. Bill detail actions retain Congress.gov's supplied sequence, including actions sharing a date. `GET /api/feed` returns the same shape for the bills matching one or more `issue_id` values from `GET /api/issues`, ranked by similarity to the nearest selected issue. Bills with no current embedding, because they arrived or changed after the last embedding run, follow the ranked ones when their title or CRS summary matches the issue's keywords, newest action first, so no bill drops out while it waits for a vector. If nothing is ranked, every keyword match is listed.

`POST /api/district-lookup` with `{"address": ...}` returns the Census Bureau's 119th Congress district for a street address, signed in or not, and `PUT /api/account/district` does the same and saves it to the signed-in account. Each API instance makes at most 4 Census lookups at once and 60 a minute, and answers 429 with `Retry-After: 60` beyond that. The cap is per instance because a visitor's address can be spoofed behind Firebase's proxies, so it protects the API and the Census Bureau but lets one busy client use up a minute's lookups for everyone.

`PUT /api/bills/{congress}/{type}/{number}/review` replaces the signed-in user's whole review, so a client sends every field, and anything left out returns to its default. That includes the two separate choices, `consent_to_share` (the office brief) and `share_publicly` (the bill page), so a form that edits only one must send back the other as loaded. `GET` on the same path returns that review.

Opening a bill stores its list of text versions, and the texts and diff endpoints fetch that list themselves when none is stored yet. `GET /api/bills/{congress}/{type}/{number}/texts` lists them, oldest first. Both methods at `.../diff?from=&to=` compare two versions by name and return any saved summary. Signed-in readers send a verified Firebase token with POST to generate a missing summary when a model is configured. Each reader can cause 20 new summaries in any 24 hours, and all readers together 500 (`READER_DAILY_LIMIT` and `TOTAL_DAILY_LIMIT` in `app/ai/diff_summary.py`), counted from `ai_calls.uid`; saved summaries are always served. The public GET serves the diff and any saved summary, so the page shows the diff first and asks for a summary separately. The line-by-line diff still returns if the comparison exceeds the summary input limit, a limit is reached or the model is unavailable. A change to the diff produces a new cache key.

The command-line tool can also generate a summary ahead of a demo. Copy the two version names from the bill page and run it with a configured model.

```bash
uv run --directory backend python -m app.ai.diff_summary \
  CONGRESS TYPE NUMBER "FROM VERSION" "TO VERSION"
```

Both detail endpoints include a `cache` object. `complete` means the bill's details and actions, or the member's entire sponsored-bill list, were fetched successfully. It does not guarantee that the upstream source itself is complete. `stale` means that the detail version is behind the latest recorded bill version or that sponsored bills are older than a day, and is also true for a missing cache. `refreshed_at` is the last successful local fetch time. `refresh_failed` records an unsuccessful refresh, and `retry_after` gives the earliest retry time. Successful refreshes clear the failure state.

An HTTP 200 response can contain an incomplete bill summary or a partial set of known sponsored bills when refresh is unavailable. Use `cache.complete` to distinguish that result from a successfully fetched empty history or sponsored list. A complete stale result can still be displayed with its fetch time. Without a configured key, endpoints serve stored data and leave incomplete caches marked as such without calling Congress.gov. An uncached bill returns 404 when it cannot be found and 502 when an upstream error prevents fetching it.

Interactive refreshes pass a five-second budget to `CongressClient`, shared across every upstream request in that refresh. Each request may wait only for the time left in that budget, so a stalled connection ends at the deadline, and database writes begin only after upstream fetching succeeds. The budget covers upstream work rather than the database or the entire endpoint. Failed refreshes of stored resources write a one-minute retry deadline to Postgres, so cooldowns survive process restarts and are shared by workers. Simultaneous first requests can still duplicate upstream fetching. A bill that Congress.gov reports as missing has no stored row, so each server process remembers it in memory for ten minutes instead. The list sync uses the client's ordinary per-request timeout without an overall five-second budget.

Bill stages are `introduced`, `committee`, `passed_one_chamber`, `passed_both_chambers`, `to_president` and `became_law`. The `passed_house` and `passed_senate` flags accumulate independently in every upsert, so Senate-originated bills follow the same rules as House-originated bills. These flags describe observed passage and do not prove that both chambers approved identical text. Text-derived stages remain approximate even with full action history, and retaining milestones also retains false-positive inferences until they are corrected explicitly.

## MCP tools

`backend/app/mcp.py` registers three read-only tools. `search_bills` uses a title keyword and optional status, `list_members` uses a state and optional chamber, and `get_bill_explanation` takes a bill's Congress, type and number. They reuse Pull's public read queries. The explanation tool returns a saved explanation or an official CRS summary. Requests are stateless, so Cloud Run instances can handle them independently. The release checks tool discovery through Cloud Run and again through Firebase Hosting.

## Merge strategy

Squash merging turns a pull request into one new commit on `develop`, which leaves your dev branch holding the original commits that `develop` does not recognise. Because the dev branches last the whole project, the next merge of `develop` into your branch would conflict with your own earlier work. A merge commit keeps the shared history, so the merge from `develop` that `git get-latest` makes stays clean.

## Merge conflicts

When the incoming code changes the same lines as your branch, `git get-latest` stops and lists the files in conflict. Git marks each conflicting section between `<<<<<<<` and `>>>>>>>` lines, with your branch's version above `=======` and the incoming version below. Edit each section into the code that should stay, delete the marker lines and save, then run the command again. It refuses to continue while any marker remains, and otherwise completes the merge and carries on with the update and push. A conflict in `package-lock.json` or `backend/uv.lock` needs no editing, because the command regenerates the lock file from the merged `package.json` or `backend/pyproject.toml`.

If a conflict is confusing, cancel the merge with `git get-latest --abort` and ask the teammate whose code it touches. Your work stays saved on your branch.

## Releases

Before each milestone, a pull request from `develop` into `main` carries the demo release. GitHub requires one approving review and passing backend and frontend checks on both branches.

The merge runs CI on the exact release commit. After the backend and frontend checks pass, the release job deploys the Cloud Run API and checks its database-backed feed before publishing the frontend build from CI. Firebase Hosting pins the site to that API revision. The final check fetches the public frontend and feed through the Hosting URL. [SETUP.md](SETUP.md#deployment-setup) describes the one-time cloud configuration.

```bash
gh pr create --base main --head develop --title "Release for milestone name"
```

## Database migrations

Create a migration with `npm run db:revision -- "describe the change"` and write the SQL in its `upgrade()` function using `op.execute`. The generated file is formatted automatically with Ruff. While everyone shares one Supabase database, only the author runs `npm run db:migrate`, and only after the pull request is merged, so two people never change the shared schema at the same time. Starting the development servers never applies migrations.

PR #6 includes migrations `803cfe036e6c` and `b71e8a40d192`, which must both be applied after merge before using the new endpoints. The latter adds cache versions, retry deadlines and independent chamber flags, and converts legacy `passed_house` and `passed_senate` stages to `passed_one_chamber`. It preserves existing records, action history and fetch timestamps, while caches lacking an upstream version are refreshed on their next eligible view. Its downgrade restores the old status vocabulary, which cannot represent two independent chamber flags.

## Branch protection

Making the repo public unlocks GitHub's own branch protection. An admin can then open Settings, then Branches, and add a rule for `main` and `develop` that requires a pull request and passing CI checks. The local hook can stay as an early warning.
