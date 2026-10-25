import { useEffect, useState } from 'react'
import { getHealth, type Health } from './api/client'

// Render the API's health report or the connection error.
function App() {
  const [health, setHealth] = useState<Health | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getHealth().then(setHealth, (e: Error) => setError(e.message))
  }, [])

  return (
    <main>
      <h1>Congress Tracker</h1>
      {error && <p>API unreachable: {error}</p>}
      {!error && !health && <p>Checking the API…</p>}
      {health && (
        <ul>
          <li>API status: {health.status}</li>
          <li>Database configured: {health.database_configured ? 'yes' : 'no'}</li>
          <li>Congress.gov key configured: {health.congress_api_configured ? 'yes' : 'no'}</li>
        </ul>
      )}
    </main>
  )
}

export default App
