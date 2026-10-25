# Congress Tracker

Congress Tracker is a web app for following U.S. legislation, being built so people can search bills, follow members of Congress and get alerts when something changes. A scheduled sync job will copy bills, members and votes from the [Congress.gov API](https://github.com/LibraryOfCongress/api.congress.gov) into Postgres, a FastAPI backend will serve that data, and a React frontend will display it. Every page will read from the project's own database rather than calling Congress.gov directly, so the app will never depend on Congress.gov being fast or on staying within its rate limit.

## Development

[SETUP.md](SETUP.md) explains how to prepare a laptop and run the app, and [CONTRIBUTING.md](CONTRIBUTING.md) covers the daily workflow, every command and how changes are reviewed and merged.

## Status

The development foundation is in place. The FastAPI backend, the React frontend, the shared commands, the setup script, the git hooks and CI all work, and the sync job can already reach Congress.gov with a teammate's API key. The database schema is being finalized and will arrive as the first migration, after which the sync job will start writing data and the first endpoints can be built. Until then the app shows a single page reporting whether the API is running and which services are configured.

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

## Stack

The table shows the planned stack and how much of each part exists today.

| Part | Technology | State |
|---|---|---|
| Frontend | React 19, TypeScript, Vite | One page that reports the API's health |
| Backend API | FastAPI on Python 3.13 | One health endpoint |
| Sync job | Python, sharing code with the API | Connection check only |
| Database | PostgreSQL on Supabase, with migrations managed by Alembic | Planned, with Alembic installed and no migrations yet |
| Login | Firebase Auth, with tokens verified by the API | Planned |

## Project layout

```
congress-tracker/
├── backend/
│   ├── app/
│   │   ├── main.py          FastAPI app, where routers are registered
│   │   ├── config.py        Settings read from .env
│   │   ├── migrate.py       Runs Alembic, or skips without a database
│   │   ├── routes/          Endpoint modules, currently only health
│   │   └── sync/            Congress.gov client and connection check
│   ├── alembic/versions/    Database migrations, empty until the schema
│   └── tests/
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
