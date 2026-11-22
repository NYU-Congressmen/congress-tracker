import { request } from './client'

// Keep this type in step with the Health model in backend/app/routes/health.py
export interface Health {
  status: string
  database_configured: boolean
  congress_api_configured: boolean
}

// Fetch the API's health report through the Vite proxy.
export function getHealth(): Promise<Health> {
  return request<Health>('/api/health')
}
