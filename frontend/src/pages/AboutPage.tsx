import { getHealth } from '../api/health'
import { LoadingState } from '../components/ui/LoadingState'
import { ErrorState } from '../components/ui/ErrorState'
import { useApi } from '../hooks/useApi'
import { PageBand } from '../components/layout/PageBand'
import { CONGRESS_NUMBER } from '../lib/constants'

function ApiStatusPanel() {
  const { data: health, loading, error, refetch } = useApi(getHealth, [])
  return (
    <section className="panel panel--stack" aria-label="API status">
      <div className="panel__heading-row">
        <h2>API status</h2>
        {!loading && !error ? (
          <button type="button" className="btn btn--ghost btn--sm" onClick={refetch}>
            Refresh
          </button>
        ) : null}
      </div>
      {loading ? (
        <LoadingState message="Checking the API…" />
      ) : error ? (
        <ErrorState title="The API is unreachable" message={error.message} onRetry={refetch} />
      ) : health ? (
        <dl className="status-list">
          <div className="status-list__row">
            <dt>API</dt>
            <dd className="status-list__ok">
              <span className="status-list__dot" aria-hidden="true" />
              {health.status}
            </dd>
          </div>
          <div className="status-list__row">
            <dt>PostgreSQL database</dt>
            <dd>{health.database_configured ? 'configured' : 'not configured'}</dd>
          </div>
          <div className="status-list__row">
            <dt>Congress.gov key</dt>
            <dd>{health.congress_api_configured ? 'configured' : 'not configured'}</dd>
          </div>
        </dl>
      ) : null}
    </section>
  )
}

// Weeks and session dates follow the bootcamp schedule for the team's Tuesday section.
const ROADMAP: { week: string; session: string; focus: string }[] = [
  { week: '5', session: 'Oct 27', focus: 'Mid-checkpoint presentation of the backend, schema and API integration' },
  { week: '6', session: 'Nov 3', focus: 'Frontend structure, legislative dashboard and an early deployment smoke test' },
  { week: '7', session: 'Nov 10', focus: 'Member profiles, login and one complete bill-tracking flow with an in-app update' },
  { week: '8', session: 'Nov 17', focus: 'Notifications, charts, testing and debugging' },
  { week: 'Break', session: 'None', focus: 'Thanksgiving break, with the final deployment and preparation' },
  { week: '9', session: 'Dec 1', focus: 'Final presentation' },
]

export default function AboutPage() {
  return (
    <div className="about">
      <PageBand labelledBy="about-title">
        <h1 id="about-title" className="page-title">
          About Pull
        </h1>
        <p className="page-lede">
          Pull follows bills in the {CONGRESS_NUMBER}th Congress from introduction through their latest recorded action.
        </p>
      </PageBand>

      <div className="container page-body about__grid">
        <div className="about__prose">
          <section className="panel panel--stack">
            <h2>Legislative data</h2>
            <p>
              A Python sync job copies every current member of Congress and a summary of every bill in the{' '}
              {CONGRESS_NUMBER}th Congress from the <a href="https://www.congress.gov" target="_blank" rel="noreferrer">Congress.gov API</a> into a
              shared PostgreSQL database. The FastAPI backend serves those stored summaries for search, and fetches a
              bill's sponsor and full action history the first time you view it.
            </p>
            <p>
              Bill status is a simplified interpretation of the observed action text: House and Senate passage are
              independent flags, and the stage distinguishes passage in one chamber from passage in both. Passing
              both chambers does not establish agreement on identical text.
            </p>
          </section>

          <section className="panel panel--stack">
            <h2>Roadmap</h2>
            <table className="roadmap-table">
              <thead>
                <tr>
                  <th scope="col">Week</th>
                  <th scope="col">Session</th>
                  <th scope="col">Focus</th>
                </tr>
              </thead>
              <tbody>
                {ROADMAP.map((row) => (
                  <tr key={row.week}>
                    <td>{row.week}</td>
                    <td>{row.session}</td>
                    <td>{row.focus}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="panel panel--stack">
            <h2>Stack</h2>
            <ul className="stack-list">
              <li>React 19, TypeScript and Vite for this interface, served by Firebase Hosting</li>
              <li>FastAPI on Python 3.13 for the API, running on Google Cloud Run</li>
              <li>PostgreSQL on Supabase with pgvector, with Alembic-managed migrations</li>
              <li>Firebase Auth phone sign-in, verified by the API on every account request</li>
              <li>A daily GitHub Actions job that syncs members, bills and summaries from the Congress.gov API</li>
              <li>OpenAI models for bill explanations, version summaries, topic matching and review moderation</li>
              <li>FastMCP tools that let AI assistants look up bills, members and explanations</li>
            </ul>
          </section>
        </div>

        <div className="about__side">
          <ApiStatusPanel />
          <section className="panel panel--stack" aria-label="Links">
            <h2>Links</h2>
            <ul className="link-list">
              <li>
                <a href="https://www.congress.gov" target="_blank" rel="noreferrer">
                  congress.gov
                </a>
              </li>
              <li>
                <a href="https://github.com/NYU-Congressmen/congress-tracker" target="_blank" rel="noreferrer">
                  Project repository
                </a>
              </li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  )
}
