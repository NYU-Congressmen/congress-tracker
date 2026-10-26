# Congress Tracker

Congress Tracker is a web app for following U.S. legislation, being built so people can search bills, follow members of Congress and get alerts when something changes. A Python sync job copies member and bill summaries from the [Congress.gov API](https://github.com/LibraryOfCongress/api.congress.gov) into Postgres, and a FastAPI backend serves stored data and fills detail caches on demand. A React frontend will display that data, with user accounts, tracking, notifications and voting records planned for later milestones.

## Development

[SETUP.md](SETUP.md) explains how to prepare a laptop and run the app, and [CONTRIBUTING.md](CONTRIBUTING.md) covers the daily workflow, every command and how changes are reviewed and merged.

## Status

The backend uses a shared PostgreSQL database on Supabase. `npm run sync` saves every current member of Congress and a summary of every bill in the 119th Congress. The API provides typed member and bill responses, search with stable bill pagination, and detail endpoints with cache freshness metadata and bounded upstream refreshes. The frontend is still the single page that reports the API's health, and frontend work starts in Week 5. Pending migrations are applied only after their pull request merges, following [CONTRIBUTING.md](CONTRIBUTING.md#database-migrations).

The initial roadmap follows the bootcamp's weekly structure. Two additions bring integration checks forward: a deployment smoke test in Week 5 and one complete login, bill-tracking and in-app update flow in Week 6. These planned additions expose hosting and authentication issues before the final deployment in Week 8, while keeping the checkpoint and final presentation dates unchanged.

| Week | Starts | Focus |
|---|---|---|
| 4 | Oct 26 | Mid-checkpoint presentation of the backend, schema and API integration |
| 5 | Nov 2 | Frontend structure, legislative dashboard and an early deployment smoke test |
| 6 | Nov 9 | Member profiles, Firebase login and one complete bill-tracking flow with an in-app update |
| 7 | Nov 16 | Notifications, charts, testing and debugging |
| 8 | Nov 23 | Final deployment and preparation |
| 9 | Nov 30 | Final presentation |

## Team

| Name | GitHub | Working branch |
|---|---|---|
| Adam | adamwwardak | dev/adam |
| Akbar | ekberby | dev/akbar |
| Abdrahman | aidahmed | dev/abdrahman |

## Data flow

Congress.gov allows [5,000 requests an hour per key](https://github.com/LibraryOfCongress/api.congress.gov#rate-limit), so search reads stored summaries. A full list sync takes roughly 80 requests at the current dataset size. A bill's sponsor and full action history are fetched on its first view and refreshed when the list sync records an upstream version newer than the cached detail version. A member's current-Congress sponsored bills are fetched on profile view and kept for a day.

Cold and stale detail requests can call Congress.gov. Their upstream work shares a five-second budget across all pages and any missing-sponsor request. A failed refresh leaves cached data intact and postpones retries for that cached resource for one minute, and a bill Congress.gov reports as missing is remembered for ten minutes so repeated requests for it spend no quota. Responses distinguish missing details from complete cached results and report staleness, the last fetch time and a failed refresh. Pagination and missing sponsors mean a new bill view can need more than two upstream requests, so caching reduces quota pressure without eliminating it.

Bill status is a simplified interpretation of observed action text, using the full cached history when available and the latest action otherwise. House and Senate passage are independent flags, and the stage distinguishes passage in one chamber from observed passage in both. Passing both chambers does not establish agreement on identical text, and the model does not fully represent vetoes or resolution-specific procedures. Syncs retain observed milestones, so a false-positive inference may require a correction. Scheduling and tracked-bill refresh remain planned work.

## Stack

The table shows the planned stack and how much of each part exists today.

| Part | Technology | State |
|---|---|---|
| Frontend | React 19, TypeScript, Vite | One page that reports the API's health |
| Backend API | FastAPI on Python 3.13 | Typed member and bill search and detail responses, cache metadata, health |
| Sync job | Python, sharing code with the API | List sync through `npm run sync` and on-demand caching, not yet scheduled |
| Database | PostgreSQL on Supabase, with migrations managed by Alembic | Members, bills and bill actions |
| Login | Firebase Auth, with tokens verified by the API | Planned |

## Project layout

```
congress-tracker/
├── backend/
│   ├── app/
│   │   ├── main.py          FastAPI app, where routers are registered
│   │   ├── config.py        Settings read from .env
│   │   ├── migrate.py       Runs Alembic, or skips without a database
│   │   ├── db.py            Database connection and query helpers
│   │   ├── models.py        Public API response models
│   │   ├── routes/          Health, member and bill endpoints
│   │   └── sync/            Congress.gov client, list sync, cache and status rules
│   ├── alembic/versions/    Database migrations, written as SQL
│   └── tests/               Unit tests, plus database tests that need PostgreSQL
├── frontend/
│   └── src/
│       ├── api/             Functions that call the backend
│       └── App.tsx
├── scripts/                 The setup script and the git hook installer
├── .githooks/               Blocks direct pushes to main and develop
├── .github/workflows/ci.yml Lint, tests and build on every pull request
├── .env.example             Template for your local .env
├── SETUP.md                 Preparing a laptop and running the app
└── CONTRIBUTING.md          Workflow, commands, pull requests and merging
```
