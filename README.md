# Congress Tracker

Congress Tracker is a web app for following U.S. legislation, being built so people can search bills, follow members of Congress and get alerts when something changes. A scheduled sync job will copy bills, members and votes from the [Congress.gov API](https://github.com/LibraryOfCongress/api.congress.gov) into Postgres, a FastAPI backend will serve that data, and a React frontend will display it. Every page will read from the project's own database rather than calling Congress.gov directly, so the app will never depend on Congress.gov being fast or on staying within its rate limit.

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

## Setup

You need Git and Node 24 installed before cloning. Node is available from [nodejs.org](https://nodejs.org), or through nvm, which reads the version from `.nvmrc`. Windows users should run the commands below in Git Bash, which ships with Git for Windows.

Clone the repo and run the setup script:

```bash
git clone git@github.com:NYU-Congressmen/congress-tracker.git
cd congress-tracker
npm run setup
```

If you have not added an SSH key to GitHub, clone with `git clone https://github.com/NYU-Congressmen/congress-tracker.git` or `gh repo clone NYU-Congressmen/congress-tracker` instead.

The setup script asks its questions first and then installs everything without further input. It checks your Node version, offers to install [uv](https://docs.astral.sh/uv/) if it is missing, creates `.env` from `.env.example`, asks for your Congress.gov API key and asks which teammate you are so it can switch you to your dev branch. It then installs the frontend packages into `node_modules` and installs Python 3.13 and the backend packages into `backend/.venv`, a virtual environment that belongs to this project alone, so you do not need to install Python yourself. The script is safe to run again at any time and never overwrites an existing `.env`.

Each teammate can get a free API key at <https://api.congress.gov/sign-up/>. What you paste at the prompt stays hidden, the script checks the key with Congress.gov before saving it, and the key is written only to `.env`, which git ignores. If you skip the prompt, paste the key after `CONGRESS_API_KEY=` in `.env` later, then confirm it works:

```bash
npm run sync
```

Start the API and the frontend together:

```bash
npm run dev
```

The app runs at <http://localhost:5173> and the API at <http://localhost:8000>, with interactive API documentation at <http://localhost:8000/docs>. Before starting, `npm run dev` applies any pending database migrations, and it skips that step with a message while `DATABASE_URL` is blank.

## Environment variables

Each teammate keeps their own `.env` at the repo root, and `.env.example` is the template. Variables starting with `VITE_` are bundled into the browser app, so a secret must never use that prefix.

| Variable | Needed | Purpose |
|---|---|---|
| `CONGRESS_API_KEY` | Now | Authenticates requests to Congress.gov |
| `DATABASE_URL` | Once the database exists | Postgres connection string from Supabase |
| `FIREBASE_PROJECT_ID` | Once login is added | Lets the API verify Firebase login tokens |
| `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID` | Once login is added | Firebase web configuration for the React app, which identifies the project and is not secret |

## Commands

All commands run from the repo root.

| Command | What it does |
|---|---|
| `npm run setup` | Installs uv if needed and every dependency, turns on the git hooks, creates `.env`, saves your API key and switches to your branch |
| `npm run dev` | Runs migrations, then the API and frontend together |
| `npm run dev:be` / `npm run dev:fe` | Runs only the API or only the frontend |
| `npm run sync` | Checks the Congress.gov key and connection |
| `npm test` | Runs the backend (pytest) and frontend (Vitest) tests |
| `npm run lint` | Checks Python with ruff and TypeScript with oxlint |
| `npm run format` | Reformats the Python code with ruff |
| `npm run db:migrate` | Applies pending database migrations |
| `npm run db:revision -- "describe the change"` | Creates a new migration file |
| `npm run build` | Builds the frontend for production |

To add a package, run `uv add --directory backend package-name` for Python or `npm install -w frontend package-name` for the frontend. Commit the updated lock file (`backend/uv.lock` or `package-lock.json`) with the change, so everyone installs the same versions.

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
└── CONTRIBUTING.md          Branches, pull requests and merging
```

New endpoints go in a module under `backend/app/routes/` and are registered in `main.py` under the `/api` prefix, which the Vite dev server forwards to the backend.

## Troubleshooting

If a command reports that `uv` is not found right after the setup script installed it, open a new terminal. The installer adds uv to your PATH, but terminals that were already open do not see the change.

If `npm run dev` stops because port 5173 or 8000 is already in use, an earlier dev server is probably still running. Stop it with Ctrl+C in its terminal, or close that terminal, and start again.

If the setup script never asks for your API key on Windows, Git Bash is not presenting itself to Node as an interactive terminal. The script prints instructions instead, so paste the key after `CONGRESS_API_KEY=` in `.env` by hand and run `npm run sync` to check it.

If a push fails with "Direct pushes to main are blocked" or the same message for develop, you committed on a shared branch. Carry those commits to your own branch with `git switch dev/your-name` followed by `git merge develop` (or `git merge main`), then push and open a pull request as described in CONTRIBUTING.md.

## Contributing

Every change goes through a pull request from your dev branch into `develop`. [CONTRIBUTING.md](CONTRIBUTING.md) has the day-to-day git commands and explains how merging works.
