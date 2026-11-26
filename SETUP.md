# Setup

Setting up a laptop takes one command once Git and Node are installed. When it is done, [CONTRIBUTING.md](CONTRIBUTING.md) covers the daily workflow and every command, and the [README](README.md) describes the project itself.

## Requirements

Install [Git](https://git-scm.com/downloads) and [Node 24](https://nodejs.org) before cloning. Node can also come from nvm, which reads the version from `.nvmrc`. Windows users should run every command in Git Bash, which ships with Git for Windows.

Python does not need to be installed separately. The setup script installs [uv](https://docs.astral.sh/uv/) if it is missing, and uv downloads Python 3.13 for this project alone.

The release script tests also use [jq](https://jqlang.org/download/), available through Homebrew or apt.

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
| `OPENAI_EMBEDDING_API_KEY` | Custom topics | An OpenAI API key for matching custom topics against the existing bill vectors. Pull can also use `LLM_API_KEY` when that key points to OpenAI |
| `PUBLIC_SITE_URL` | To test share links locally | The address share links point to. It defaults to `https://congress-pull.web.app`, and `http://localhost:5173` keeps local links on the Vite dev server |
| `BLUESKY_HANDLE`, `BLUESKY_APP_PASSWORD` | Only where the sync runs | Pull's own Bluesky account and an app password made in its settings, which the sync uses to find posts carrying share links. Never use the account's real password |
| `FIREBASE_PROJECT_ID` | For phone sign-in | Identifies the Firebase project whose tokens the API accepts |
| `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID` | For local Firebase configuration | Identifies the Firebase project to the browser SDK. Firebase Hosting supplies these values in production |

## Local phone verification

Use an authorized Firebase project with a fictional phone number configured in Authentication. The number's country must be on the Firebase SMS allowlist. Starting Vite with `VITE_FIREBASE_PHONE_TEST_MODE=true` enables Firebase's fictional-number test mode on localhost. The code configured in Firebase completes verification without an SMS. The API verifies the resulting Firebase token, and the production build uses standard reCAPTCHA. [Firebase phone sign-in tests](https://firebase.google.com/docs/auth/web/phone-auth#test-with-fictional-phone-numbers)

## Database tests

The database tests check migration upgrades and downgrades, cache versions, retry cooldowns, atomic writes, chamber-passage milestones and search pagination against a real PostgreSQL. They skip themselves when none is available, so `npm test` passes without one. CI always runs them against its own PostgreSQL, so installing it locally is optional and only needed to run those tests before pushing. The tests empty their database every run, so they only use a database whose name contains "test" and refuse anything else. Set `REQUIRE_TEST_DATABASE=1` to make an unavailable test database fail locally as it does in CI.

On Linux, install PostgreSQL and pgvector, make your user a superuser of the local PostgreSQL, because enabling pgvector requires one, and create the test database. The pgvector package must match your PostgreSQL version, which is 18 on current Ubuntu:

```bash
sudo apt install postgresql postgresql-18-pgvector
sudo -u postgres createuser --superuser "$USER"
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

## Daily sync

`.github/workflows/sync.yml` runs the same sync as `npm run sync` every day at 10:00 UTC, and anyone with write access can start it from the Actions tab. GitHub runs scheduled workflows from the default branch, `develop`. The workflow reads the repository secrets `DATABASE_URL` and `CONGRESS_API_KEY`, plus `BLUESKY_HANDLE` and `BLUESKY_APP_PASSWORD` once Pull's Bluesky account is set up. GitHub's runners use IPv4, so `DATABASE_URL` is the Supabase session pooler string, as for Cloud Run. Until both required secrets exist, each run ends with a warning and changes nothing. A repository admin adds a secret by running the command below and pasting the value when asked, which keeps it out of the shell history. [GitHub Actions secrets](https://docs.github.com/en/actions/security-for-github-actions/security-guides/using-secrets-in-github-actions)

```bash
gh secret set DATABASE_URL --repo NYU-Congressmen/congress-tracker
```

## Deployment setup

The release workflow uses the `congress-pull` Firebase and Google Cloud project, the default Hosting site and the `pull-api` Cloud Run service in `us-east1`. Cloud Run reads `DATABASE_URL` from a pinned version of the `pull-database-url` Secret Manager secret. The runtime service account needs Secret Manager Secret Accessor on that secret. The Supabase session pooler supplies the IPv4 connection string for Cloud Run. [Cloud Run secrets](https://docs.cloud.google.com/run/docs/configuring/services/secrets) [Supabase connection modes](https://supabase.com/docs/guides/database/connecting-to-postgres)

Phone sign-in uses the Firebase Hosting configuration endpoint in the browser and the Cloud Run service identity through Application Default Credentials in the API. The hosted account page is `/sign-in`. A hosted sign-in check uses a domain authorized in Firebase Auth and a configured fictional number, which sends no SMS. The check covers code verification, saving and reopening a review, and signing out. [Firebase phone sign-in](https://firebase.google.com/docs/auth/web/phone-auth)

GitHub Actions uses Workload Identity Federation to impersonate `pull-release@congress-pull.iam.gserviceaccount.com`. The repository variable `PULL_WIF_PROVIDER` holds the full provider resource name. The provider accepts push tokens for this repository's numeric ID on `refs/heads/main` from `.github/workflows/ci.yml`. The release service account uses Cloud Run Source Developer, Service Usage Consumer, Firebase Hosting Admin and API Keys Viewer, with Service Account User on the Cloud Run runtime and Cloud Build identities. The Cloud Build identity uses Cloud Run Builder. [Google Cloud federation setup](https://docs.cloud.google.com/iam/docs/workload-identity-federation-with-deployment-pipelines) [Firebase deployment roles](https://firebase.google.com/docs/projects/iam/roles-predefined-product)

The private `pull-schema-check` job in `us-east1` runs a pinned image built from `scripts/release-schema` as the Cloud Run runtime account. It reads the Alembic revision and checks the feed, account profile and call log schema in a read-only transaction. The release account's Cloud Run Source Developer role lets GitHub execute the job with the expected revision as an argument. The API and job use the same numbered database secret version. When that version changes, the release check resumes after both references match. [Cloud Run jobs](https://docs.cloud.google.com/run/docs/execute/jobs)

Cloud Run reads `OPENAI_EMBEDDING_API_KEY` from the `pull-openai-embedding-key` secret for custom topics and `LLM_API_KEY` from `pull-llm-api-key` for comparison summaries, each pinned to a numbered version, with `LLM_BASE_URL` and `LLM_MODEL` as plain variables. Separate OpenAI keys keep each feature's spend visible on the OpenAI usage page, and `ai_calls` records the cost of every call by feature. A release keeps these bindings, and `/api/health` reports `custom_topics_configured` and `summaries_configured`.

### Schema checker image

After a change to the checker, build its image from the reviewed checkout and update the job using the SHA-256 digest shown in the Cloud Build results. Replace `REVIEWED_COMMIT` and `IMAGE_DIGEST` with the commit identifier and full digest, including the `sha256:` prefix.

```bash
image=us-east1-docker.pkg.dev/congress-pull/cloud-run-source-deploy/pull-schema-check
gcloud builds submit scripts/release-schema \
  --project=congress-pull --region=us-east1 --tag="$image:REVIEWED_COMMIT"
gcloud run jobs update pull-schema-check \
  --project=congress-pull --region=us-east1 --image="$image@IMAGE_DIGEST"
```

## MCP clients

Connect a client using Streamable HTTP. The local FastAPI server exposes `http://127.0.0.1:8000/mcp`, and Firebase Hosting exposes `https://congress-pull.web.app/mcp` once the release containing the endpoint is deployed. Pull's tools read public data from PostgreSQL without extra credentials. [FastMCP clients](https://gofastmcp.com/clients/transports)

## Troubleshooting

If a command reports that `uv` is not found right after the setup script installed it, open a new terminal. The installer adds uv to your PATH, but terminals that were already open do not see the change.

If the setup script never asks for your API key on Windows, Git Bash is not presenting itself to Node as an interactive terminal. The script prints instructions instead, so paste the key into `.env` by hand and run `npm run sync` to check it.

If `npm run dev` stops because port 5173 or 8000 is already in use, an earlier dev server is probably still running. Stop it with Ctrl+C in its terminal, or close that terminal, and start again.

If a database-backed endpoint reports a missing cache or passage column after pulling changes, ask the migration's author to check that the merged migrations were applied. Do not run an unmerged migration against the shared database. The cache fields shown in `/docs` explain whether a detail response is complete, stale or waiting to retry after an upstream failure.
