# Setup

Setting up a laptop takes one command once Git and Node are installed. When it is done, [CONTRIBUTING.md](CONTRIBUTING.md) covers the daily workflow and every command, and the [README](README.md) describes the project itself.

## Requirements

Install [Git](https://git-scm.com/downloads) and [Node 24](https://nodejs.org) before cloning. Node can also come from nvm, which reads the version from `.nvmrc`. Windows users should run every command in Git Bash, which ships with Git for Windows.

Python does not need to be installed separately. The setup script installs [uv](https://docs.astral.sh/uv/) if it is missing, and uv downloads Python 3.13 for this project alone.

## Installation

Clone the repo and run the setup script:

```bash
git clone git@github.com:NYU-Congressmen/congress-tracker.git
cd congress-tracker
npm run setup
```

Without an SSH key on GitHub, clone with `git clone https://github.com/NYU-Congressmen/congress-tracker.git` or `gh repo clone NYU-Congressmen/congress-tracker` instead.

The script asks its questions first and then installs everything without further input. It checks the Node version, offers to install uv, creates `.env` from `.env.example`, asks for a Congress.gov API key and asks which teammate is running it so it can switch to that person's dev branch. It then installs the frontend packages into `node_modules` and the backend packages into `backend/.venv`, a virtual environment that belongs to this project alone, and turns on the repo's git hooks along with the `git get-latest` command described in [CONTRIBUTING.md](CONTRIBUTING.md#daily-workflow). Rerunning it preserves existing settings and offers to add a key when one is missing. Outside Windows, it restricts `.env` permissions to its owner before prompting for a key.

## API key

Each teammate needs their own free key from <https://api.congress.gov/sign-up/>. What you paste at the script's prompt stays hidden, the script checks the key with Congress.gov before saving it, and the key is written only to `.env`, which git ignores. Validation waits up to ten seconds. If Congress.gov cannot be reached, setup reports that the key was saved unchecked. If you skipped the prompt, paste the key after `CONGRESS_API_KEY=` in `.env` and confirm it works:

```bash
npm run sync
```

## Running the app

Start the API and the frontend together:

```bash
npm run dev
```

The app runs at <http://localhost:5173> and the API at <http://localhost:8000>, with interactive API documentation at <http://localhost:8000/docs>. Both servers stop when either exits. Database migrations run separately through the workflow in [CONTRIBUTING.md](CONTRIBUTING.md#database-migrations).

## Environment variables

Each teammate keeps their own `.env` at the repo root, and `.env.example` is the template. Variables starting with `VITE_` are bundled into the browser app, so a secret must never use that prefix.

| Variable | Needed | Purpose |
|---|---|---|
| `CONGRESS_API_KEY` | Now | Authenticates requests to Congress.gov |
| `DATABASE_URL` | To see real data | Connection string for the team's Supabase database. Ask the teammate who manages it to send it privately, and never paste it into the repo or a group chat |
| `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL` | Once the AI service is added | Your own free Gemini key from <https://aistudio.google.com/apikey>, with the endpoint and model from `.env.example`. The AI service calls the model through OpenAI's SDK, so another provider needs only different values here |
| `FIREBASE_PROJECT_ID` | Once login is added | Lets the API verify Firebase login tokens |
| `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID` | Once login is added | Firebase web configuration for the React app, which identifies the project and is not secret |

## Database tests

The database tests check migration upgrades and downgrades, cache versions, retry cooldowns, atomic writes, chamber-passage milestones and search pagination against a real PostgreSQL. They skip themselves when none is available, so `npm test` passes without one. CI always runs them against its own PostgreSQL, so installing it locally is optional and only needed to run those tests before pushing. The tests empty their database every run, so they only use a database whose name contains "test" and refuse anything else. Set `REQUIRE_TEST_DATABASE=1` to make an unavailable test database fail locally as it does in CI.

On Linux, install PostgreSQL, give your user permission to create databases, and create the test database:

```bash
sudo apt install postgresql
sudo apt install postgresql-17-pgvector
sudo -u postgres createuser --createdb "$USER"
createdb congress_test
```

On macOS with Homebrew:

```bash
brew install postgresql@17
brew install pgvector
brew services start postgresql@17
createdb congress_test
```

On Windows, install PostgreSQL from <https://www.postgresql.org/download/windows/>, create a database named `congress_test` in pgAdmin, and set `TEST_DATABASE_URL` to `postgresql://postgres:your-password@localhost:5432/congress_test` before running the tests. Linux and macOS need no variable, because the tests connect to `congress_test` through the local socket by default.

The migrations enable the pgvector extension, so the test database needs pgvector installed as well. The commands above include it on Linux and macOS. On Windows, follow the installation steps at <https://github.com/pgvector/pgvector#windows>. CI uses the `pgvector/pgvector:pg17` image, which has it built in.

## Troubleshooting

If a command reports that `uv` is not found right after the setup script installed it, open a new terminal. The installer adds uv to your PATH, but terminals that were already open do not see the change.

If the setup script never asks for your API key on Windows, Git Bash is not presenting itself to Node as an interactive terminal. The script prints instructions instead, so paste the key into `.env` by hand and run `npm run sync` to check it.

If `npm run dev` stops because port 5173 or 8000 is already in use, an earlier dev server is probably still running. Stop it with Ctrl+C in its terminal, or close that terminal, and start again.

If a database-backed endpoint reports a missing cache or passage column after pulling changes, ask the migration's author to check that the merged migrations were applied. Do not run an unmerged migration against the shared database. The cache fields shown in `/docs` explain whether a detail response is complete, stale or waiting to retry after an upstream failure.
