import { getHealth } from '../api/health'
import { LoadingState } from '../components/ui/LoadingState'
import { ErrorState } from '../components/ui/ErrorState'
import { useApi } from '../hooks/useApi'
import { CONGRESS_NUMBER } from '../lib/constants'

function ApiStatusPanel() {
  const { data: health, loading, error, refetch } = useApi(getHealth, [])
  return (
    <section className="panel" aria-label="API status">
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

const ROADMAP: { week: string; starts: string; focus: string }[] = [
  { week: '5', starts: 'Nov 2', focus: 'Frontend structure, legislative dashboard and an early deployment smoke test' },
  { week: '6', starts: 'Nov 9', focus: 'Member profiles, login and one complete bill-tracking flow with an in-app update' },
  { week: '7', starts: 'Nov 16', focus: 'Notifications, charts, testing and debugging' },
  { week: '8', starts: 'Nov 23', focus: 'Final deployment and preparation' },
  { week: '9', starts: 'Nov 30', focus: 'Final presentation' },
]

export default function AboutPage() {
  return (
    <div className="container page about">
      <header className="page__header">
        <h1>About Pull</h1>
        <p className="page__lede">
          A web app for following U.S. legislation: search bills, follow members of Congress, and see how
          legislation moves through the {CONGRESS_NUMBER}th Congress.
        </p>
      </header>

      <div className="about__grid">
        <div className="about__prose">
          <section className="panel">
            <h2>How the data works</h2>
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

          <section className="panel">
            <h2>Roadmap</h2>
            <table className="roadmap-table">
              <thead>
                <tr>
                  <th scope="col">Week</th>
                  <th scope="col">Starts</th>
                  <th scope="col">Focus</th>
                </tr>
              </thead>
              <tbody>
                {ROADMAP.map((row) => (
                  <tr key={row.week}>
                    <td>{row.week}</td>
                    <td>{row.starts}</td>
                    <td>{row.focus}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="panel">
            <h2>Stack</h2>
            <ul className="stack-list">
              <li>React 19, TypeScript and Vite for this interface</li>
              <li>FastAPI on Python 3.13 for the API and sync job</li>
              <li>PostgreSQL with Alembic-managed migrations for stored data</li>
              <li>Firebase Auth for sign-in, planned for the next milestone</li>
            </ul>
          </section>
        </div>

        <div className="about__side">
          <ApiStatusPanel />
          <section className="panel" aria-label="Links">
            <h2>Links</h2>
            <ul className="link-list">
              {import.meta.env.DEV && (
                <li>
                  <a href="http://localhost:8000/docs" target="_blank" rel="noreferrer">
                    Interactive API documentation
                  </a>
                </li>
              )}
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
