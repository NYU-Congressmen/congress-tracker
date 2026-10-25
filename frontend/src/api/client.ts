// Keep this type in step with the Health model in backend/app/routes/health.py, which defines the response
export type Health = {
  status: string
  database_configured: boolean
  congress_api_configured: boolean
}

// Fetch the API's health report through the Vite proxy and return it.
export async function getHealth(): Promise<Health> {
  const response = await fetch('/api/health')
  if (!response.ok) {
    throw new Error(`API returned ${response.status}`)
  }
  return response.json()
}
