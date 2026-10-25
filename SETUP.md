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

The script asks its questions first and then installs everything without further input. It checks the Node version, offers to install uv, creates `.env` from `.env.example`, asks for a Congress.gov API key and asks which teammate is running it so it can switch to that person's dev branch. It then installs the frontend packages into `node_modules` and the backend packages into `backend/.venv`, a virtual environment that belongs to this project alone, and turns on the repo's git hooks. The script is safe to run again at any time and never overwrites an existing `.env`.

## API key

Each teammate needs their own free key from <https://api.congress.gov/sign-up/>. What you paste at the script's prompt stays hidden, the script checks the key with Congress.gov before saving it, and the key is written only to `.env`, which git ignores. If you skipped the prompt, paste the key after `CONGRESS_API_KEY=` in `.env` and confirm it works:

```bash
npm run sync
```

## Running the app

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

## Troubleshooting

If a command reports that `uv` is not found right after the setup script installed it, open a new terminal. The installer adds uv to your PATH, but terminals that were already open do not see the change.

If the setup script never asks for your API key on Windows, Git Bash is not presenting itself to Node as an interactive terminal. The script prints instructions instead, so paste the key into `.env` by hand and run `npm run sync` to check it.

If `npm run dev` stops because port 5173 or 8000 is already in use, an earlier dev server is probably still running. Stop it with Ctrl+C in its terminal, or close that terminal, and start again.
