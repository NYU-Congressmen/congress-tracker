# Congress Tracker

Congress Tracker is a web app for following U.S. legislation, being built so people can search bills, follow members of Congress and get alerts when something changes. A scheduled sync job will copy bills, members and votes from the [Congress.gov API](https://github.com/LibraryOfCongress/api.congress.gov) into Postgres, a FastAPI backend will serve that data, and a React frontend will display it. Every page will read from the project's own database rather than calling Congress.gov directly, so the app will never depend on Congress.gov being fast or on staying within its rate limit.

## Development

[SETUP.md](SETUP.md) explains how to prepare a laptop and run the app, and [CONTRIBUTING.md](CONTRIBUTING.md) covers the daily workflow, every command and how changes are reviewed and merged.

## Status

The backend stores its data in a shared PostgreSQL database on Supabase. `npm run sync` saves every current member of Congress and a summary of every bill in the 119th Congress, and the API serves member and bill search along with detail pages for a single bill or member. The frontend is still the single page that reports the API's health, and frontend work starts in Week 5.

The features follow the initial roadmap below, and this section is updated as each one lands.

| Week | Starts | Focus |
|---|---|---|
| 4 | Oct 26 | Mid-checkpoint presentation of the backend, schema and API integration |
| 5 | Nov 2 | Frontend structure and the legislative dashboard |
| 6 | Nov 9 | Member profiles and Firebase login |
| 7 | Nov 16 | Notifications, charts, testing and debugging |
| 8 | Nov 23 | Deployment and final preparation |
| 9 | Nov 30 | Final presentation |

## Team

| Name | GitHub | Working branch |
|---|---|---|
| Adam | adamwwardak | dev/adam |
| Akbar | ekberby | dev/akbar |
| Abdrahman | aidahmed | dev/abdrahman |

## Data flow

Congress.gov allows 5,000 requests an hour per key, so the app never passes a visitor's request straight through to it. A list sync fills the database with every current member and a summary of every bill in about 80 requests, which is enough for search and filtering. A bill's sponsor and full action history are fetched the first time someone opens that bill and are fetched again only when the list sync records a newer update date for it. A member's sponsored bills are fetched when their profile is opened and kept for a day. When Congress.gov cannot be reached, the API returns what it has cached.

Bill status comes from the furthest stage in a bill's action history once someone has opened that bill, and from its latest action until then, which can understate how far an unopened bill has gone. No sync ever moves a bill back to an earlier stage. Refreshing tracked bills on a schedule will arrive with user accounts and tracking.

## Stack

The table shows the planned stack and how much of each part exists today.

| Part | Technology | State |
|---|---|---|
| Frontend | React 19, TypeScript, Vite | One page that reports the API's health |
| Backend API | FastAPI on Python 3.13 | Member and bill search, member and bill detail, health |
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
