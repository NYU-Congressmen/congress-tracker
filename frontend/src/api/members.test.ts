import { afterEach, expect, test, vi } from 'vitest'
import { listMembers } from './members'
import { mockApi } from '../test/fetchMock'

afterEach(() => {
  vi.unstubAllGlobals()
})

test('shares an in-flight member list and requests again once it settles', async () => {
  const fetchMock = mockApi([{ match: '/api/members', body: { total: 0, data: [] } }])

  const [first, second] = await Promise.all([listMembers({ state: 'NY' }), listMembers({ state: 'NY' })])
  expect(first).toBe(second)
  expect(fetchMock).toHaveBeenCalledTimes(1)

  await listMembers({ state: 'CA' })
  await listMembers({ state: 'NY' })
  expect(fetchMock.mock.calls.map((call) => String(call[0]))).toEqual([
    '/api/members?state=NY', '/api/members?state=CA', '/api/members?state=NY',
  ])
})
