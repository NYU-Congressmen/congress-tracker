# Congress Tracker

Congress Tracker is a web app for following U.S. legislation. It lets people search bills, follow members of Congress and get alerts when something changes. A scheduled sync job copies bills, members and House votes from the [Congress.gov API](https://github.com/LibraryOfCongress/api.congress.gov) into Postgres, a FastAPI backend serves that data, and a React frontend displays it. Every page reads from the project's own database, so the app never depends on Congress.gov being fast or within its rate limit.

## Team

| Name | GitHub | Working branch |
|---|---|---|
| Adam | adamwwardak | dev/adam |
| Akbar | ekberby | dev/akbar |
| Abdrahman | aidahmed | dev/abdrahman |

## Stack

| Part | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite |
| Backend API | FastAPI on Python 3.13 |
| Sync job | Python, using the same code as the API |
| Database | PostgreSQL on Supabase, migrated with Alembic |
| Login | Firebase Auth, with tokens verified by the API |

## Getting started

You need three tools installed before cloning. Git comes first, then Node 24 from [nodejs.org](https://nodejs.org) or through nvm, which reads the version from `.nvmrc`. The last is [uv](https://docs.astral.sh/uv/getting-started/installation/), which installs Python 3.13 by itself the first time it runs, so you do not need to install Python separately. Windows users should run the commands below in Git Bash, which ships with Git for Windows.

Clone the repo, install everything and switch to your own branch:

```bash
git clone git@github.com:NYU-Congressmen/congress-tracker.git
cd congress-tracker
npm run setup
cp .env.example .env
git switch dev/your-name
```

If you have not set up an SSH key with GitHub, clone with `gh repo clone NYU-Congressmen/congress-tracker` or the HTTPS URL instead. `npm run setup` installs the frontend packages into `node_modules` and the backend packages into `backend/.venv`, a virtual environment that belongs to this project alone, and it also turns on the repo's git hooks. Open `.env` and paste your Congress.gov API key after `CONGRESS_API_KEY=`. Each teammate can get their own key free at <https://api.congress.gov/sign-up/>.

Start the API and the frontend together:

```bash
npm run dev
```

The app runs at <http://localhost:5173> and the API at <http://localhost:8000>, with interactive API documentation at <http://localhost:8000/docs>. The page shows whether the API is reachable and which services are configured. Before starting, `npm run dev` applies any pending database migrations, and it skips that step with a message while `DATABASE_URL` is blank.

## Commands

All commands run from the repo root.

| Command | What it does |
|---|---|
| `npm run setup` | Installs every dependency and the git hooks |
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
│   │   ├── main.py          FastAPI app; routers are registered here
│   │   ├── config.py        Settings read from .env
│   │   ├── migrate.py       Runs Alembic, or skips without a database
│   │   ├── routes/          One module per group of endpoints
│   │   └── sync/            Congress.gov client and the sync job
│   ├── alembic/versions/    Database migrations, written as SQL
│   └── tests/
├── frontend/
│   └── src/
│       ├── api/             Functions that call the backend
│       └── App.tsx
├── .githooks/               Blocks direct pushes to main and develop
├── .github/workflows/ci.yml Lint, tests and build on every pull request
└── .env.example             Template for your local .env
```

New endpoints go in a module under `backend/app/routes/` and are registered in `main.py` under the `/api` prefix, which the Vite dev server forwards to the backend. The database schema arrives as the first migration in `backend/alembic/versions/`.

## Contributing

Every change goes through a pull request from your dev branch into `develop`. [CONTRIBUTING.md](CONTRIBUTING.md) has the day-to-day git commands and explains how merging works.
