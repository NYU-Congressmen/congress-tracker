# Pull

Pull is a web app for understanding and following U.S. legislation. We treat bills like pull requests, with legislative timelines, side-by-side text comparisons and space to record a stance. Readers can search 119th Congress bills by title or bill number, explore the topic feed and find their representatives. [Open Pull](https://congress-pull.web.app/)

## Development

[SETUP.md](SETUP.md) explains how to prepare a laptop and run the app, and [CONTRIBUTING.md](CONTRIBUTING.md) covers the daily workflow, every command and how changes are reviewed and merged.

## Status

Onboarding has one district search that accepts a street address, a ZIP code or a state. A full address is matched by the Census Bureau for the 119th Congress, and anything less specific lists the districts it covers with each House member and the state's senators for the reader to choose. Readers can also pick a district on a map or by number. Firebase phone verification completes account setup, and Pull saves the address match as a state and district. Choosing a search result, a map district or a number later clears that saved match, so the account never keeps a district the profile no longer shows. The topic picker starts with five choices and adds related topics as readers make selections. The dashboard uses the topics saved on the account, and My representatives uses the selected district. Each verified account has one profile with an editable name, district, topics and social handles, and signed-out visitors have no profile. Phone sign-in loads that profile and its saved bill reviews across browsers. The dashboard also shows a seating chart for the House, Senate and Joint session. Bill pages show legislative actions and let readers open a published version directly or compare two versions. The comparison shows a saved summary above passages labeled Added and Removed, with controls for Changes, Context and Full text. Signed-in readers can generate a missing summary when a model is configured. Member profiles show sponsored bills and office contact details, with the room, building and mailing locality on separate lines when available.

Signed-in readers can save a stance directly on the bill page. The page shows Pull response counts alongside official bill status and available House roll-call results. It also lists recorded cosponsors when available. Readers can add a review on Social and choose separately whether to publish it on Pull and include it in the Constituent Signal brief. OpenAI's Moderation endpoint checks review text before a shared review appears publicly. The bill page lists shared reviews with each author's district, by default from the reader's own district, and readers can report a review or hide their own. Opening a representative's phone link on the bill page adds a private call entry that the reader can annotate or delete. Signed-in readers can track a bill from its page. When a tracked bill gets a newer official action, through the daily sync or when the bill is refreshed, each reader tracking it gets an update, which shows as a count on the account avatar, in the account menu and as a New update label in Bills you track on the dashboard until the reader opens the bill. The daily sync also drafts a weekly Constituent Signal brief for each office on tracked and reviewed bills, counting consenting constituents' stances in the office's district or state and the calls they logged to that office, and the past seven days' counts appear on each office's card under Contact your representatives and publicly on the member's page once at least 5 constituents are counted for a bill. On each bill page, a signed-in reader's Your contribution box, visible only to them, holds their stance, story, whether the story is listed in Shared reviews and whether they are counted in the Constituent Signal, with a summary of what others can see. The account menu lists recent updates on tracked bills. The Explanation panel shows saved explanations with Summary, Limits, Status and Next steps, or the official summary by itself when available. The public deployment serves stored legislative data from Supabase.

MCP clients can search stored bills, list current members and read saved bill explanations through the read-only `/mcp` endpoint. [MCP setup](SETUP.md#mcp-clients)

Pull follows the device theme until a visitor chooses Day or Night. The arrow beside the theme button restores the device setting.

Firebase Hosting serves the React app over HTTPS and forwards `/api` requests to a pinned FastAPI revision on Cloud Run. App pages send a Content Security Policy and block framing. The automated release workflow checks the production database schema and API before publishing the tested frontend build, then checks the public feed. [Release workflow](CONTRIBUTING.md#releases)

## Initial roadmap

The initial roadmap follows the bootcamp's weekly sessions for our Tuesday section. It brings integration checks forward by including a deployment smoke test in Week 6 and one complete login, bill-tracking and in-app update flow in Week 7.

| Week | Session | Focus |
|---|---|---|
| 5 | Oct 27 | Mid-checkpoint presentation of the backend, schema and API integration |
| 6 | Nov 3 | Frontend structure, legislative dashboard and an early deployment smoke test |
| 7 | Nov 10 | Member profiles, Firebase login and one complete bill-tracking flow with an in-app update |
| 8 | Nov 17 | Notifications, charts, testing and debugging |
| Break | None | Thanksgiving break, with the final deployment and preparation |
| 9 | Dec 1 | Final presentation |

## Team

| Name | GitHub | Working branch |
|---|---|---|
| Adam | adamwwardak | dev/adam |
| Akbar | ekberby | dev/akbar |
| Abdrahman | aidahmed | dev/abdrahman |

## Data flow

A Python sync job copies member and bill records and Congressional Research Service summaries into Postgres. Search reads stored data. The topic feed ranks bills by similarity using saved embeddings, with keyword matching as a fallback. Readers can follow custom topics, which Pull matches against the bill embeddings when an embedding provider is configured. With a Congress.gov key configured, the API fetches a bill's sponsor, full action history and list of text versions on its first view and refreshes them when the list sync records a newer upstream version. A member's current-Congress sponsored bills are fetched on profile view and kept for a day. The member sync also fetches office contact details for new or changed members. [Congress.gov API](https://github.com/LibraryOfCongress/api.congress.gov)

Cold and stale detail requests can call Congress.gov. Their upstream work shares a five-second budget across all pages and any missing-sponsor request. A failed refresh leaves cached data intact and postpones retries for that cached resource for one minute, and a bill Congress.gov reports as missing is remembered for ten minutes so repeated requests for it spend no quota. Responses distinguish missing details from complete cached results and report staleness, the last fetch time and a failed refresh. Pagination and missing sponsors mean a new bill view can need more than two upstream requests, so caching reduces quota pressure without eliminating it.

Opening or comparing bill versions downloads and caches their text as needed. The explanation command uses the latest stored CRS summary or the bill's earliest published text alongside status, committee and related-bill context. The model writes three sections when the official summary supplies the first, and otherwise writes all four. The AI cache key includes the feature, prompt version, model and exact messages, so changed input produces a new key. The public explanation endpoint reads saved results and official summaries from Supabase.

Bill status is a simplified interpretation of observed action text, using the full cached history when available and the latest action otherwise. House and Senate passage are independent flags, and the stage distinguishes passage in one chamber from observed passage in both. Passing both chambers does not establish agreement on identical text, and the status rules do not fully represent vetoes or resolution-specific procedures. Syncs retain observed milestones, so a false-positive inference may require a correction. The daily sync refreshes the details of tracked and reviewed bills.

## Stack

| Part | Technology | State |
|---|---|---|
| Frontend | React 19, TypeScript, Vite | Dashboard, search, detail pages, account profiles, phone sign-in and stance drafts |
| Backend API | FastAPI on Python 3.13 | Bills, members, text comparisons, topics, feed, explanations, accounts and reviews |
| Sync job | Python, sharing code with the API | Manual list sync through `npm run sync` and on-demand caching |
| Database | PostgreSQL on Supabase, Alembic, pgvector | Legislative data, user and review tables, tracking and brief tables, AI cache and call log |
| AI | OpenAI SDK with a configurable OpenAI-compatible endpoint | Structured explanations, result caching and call logging |
| Deployment | Firebase Hosting, Cloud Run, GitHub Actions | Live app and API, with a release workflow for `main` |

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
│   │   ├── auth.py          Firebase token verification and account identity
│   │   ├── ai/              Explanation prompts, model calls, caching and logging
│   │   ├── routes/          Health, member, bill, feed, explanation, account and review endpoints
│   │   └── sync/            Congress.gov client, list sync, cache and status rules
│   ├── alembic/versions/    Database migrations, written as SQL
│   └── tests/               Unit tests, plus database tests that need PostgreSQL
├── frontend/
│   └── src/
│       ├── api/             Functions that call the backend
│       ├── auth/            Firebase client and verified account session
│       ├── components/      Layout, bill, member and shared UI components
│       ├── pages/           Dashboard, onboarding, sign-in, bill, member and social pages
│       ├── profile/         Account profiles and browser profile import
│       └── App.tsx          Browser routes and shared layout
├── scripts/                 Setup, branch updates, deployment and smoke checks
├── .githooks/               Blocks direct pushes to main and develop
├── .github/workflows/ci.yml  Pull request checks and releases from main
├── firebase.json            Hosting routes and browser security headers
├── .env.example             Template for your local .env
├── SETUP.md                 Preparing a laptop and running the app
└── CONTRIBUTING.md          Workflow, commands, pull requests and merging
```
