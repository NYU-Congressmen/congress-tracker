import { render, screen, waitFor } from '@testing-library/react'
import type { User } from '@firebase/auth'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { SessionContext } from '../../auth/SessionContext'
import { TopicFeed } from './TopicFeed'
import { mockApi } from '../../test/fetchMock'

const ISSUES = [
  { issue_id: 1, name: 'Health care' },
  { issue_id: 2, name: 'Housing' },
]

const FEED = {
  total: 1,
  page: 1,
  limit: 8,
  data: [
    {
      bill_id: '119-hr-7',
      congress: 119,
      type: 'hr',
      number: 7,
      title: 'To expand hospital coverage',
      status: 'committee',
      passed_house: false,
      passed_senate: false,
      introduced_date: '2026-01-07',
      latest_action_date: '2026-03-02',
      latest_action_text: 'Referred to committee.',
    },
  ],
}

function renderFeed(topicIds: number[]) {
  const fetchMock = mockApi([
    { match: '/api/feed', body: FEED },
    { match: '/api/issues', body: ISSUES },
  ])
  return {
    fetchMock,
    view: render(
      <MemoryRouter>
        <TopicFeed topicIds={topicIds} />
      </MemoryRouter>,
    ),
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('TopicFeed', () => {
  test('points to onboarding and makes no feed call when no topics are followed', async () => {
    const { fetchMock } = renderFeed([])

    expect(await screen.findByText('No topics chosen yet')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Choose topics' })).toBeTruthy()
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('/api/feed'))).toBe(false)
  })

  test('lists the bills on the followed topics with their names', async () => {
    renderFeed([1])

    expect(await screen.findByText('To expand hospital coverage')).toBeTruthy()
    expect(screen.getByText('Health care')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Change topics' })).toBeTruthy()
  })

  test('sends every followed topic to the feed request', async () => {
    const { fetchMock } = renderFeed([1, 2])

    await screen.findByText('To expand hospital coverage')
    const feedCalls = fetchMock.mock.calls.filter((candidate) => String(candidate[0]).includes('/api/feed'))
    const url = decodeURIComponent(String(feedCalls[feedCalls.length - 1]?.[0]))
    expect(url).toContain('issue_id=1')
    expect(url).toContain('issue_id=2')
  })

  test('requests a signed-in feed alongside the custom topic names', async () => {
    let releaseTopics = () => {}
    const topicsHeld = new Promise<void>((resolve) => { releaseTopics = resolve })
    const fetchMock = mockApi([
      { match: '/api/feed', body: FEED },
      { match: '/api/issues', body: ISSUES },
    ])
    const routed = fetchMock.getMockImplementation()!
    fetchMock.mockImplementation(async (input, init) => {
      if (String(input).includes('/api/account/custom-topics')) {
        await topicsHeld
        return Response.json(['rural broadband'])
      }
      return routed(input, init)
    })
    const user = { uid: 'reader', getIdToken: vi.fn().mockResolvedValue('verified-token') } as unknown as User
    render(
      <SessionContext.Provider value={{ user, loading: false, error: null, retry: () => {} }}>
        <MemoryRouter>
          <TopicFeed topicIds={[1]} />
        </MemoryRouter>
      </SessionContext.Provider>,
    )

    // The feed request goes out while the custom topic names are still loading.
    await waitFor(() => expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('include_custom=true'))).toBe(true))
    releaseTopics()
    expect(await screen.findByText('Health care · rural broadband')).toBeTruthy()
    expect(screen.getByText('To expand hospital coverage')).toBeTruthy()
  })

  test.each([
    { custom: [], feedRequested: false },
    { custom: ['rural broadband'], feedRequested: true },
  ])('requests a feed without preset topics only for custom topics $custom', async ({ custom, feedRequested }) => {
    const fetchMock = mockApi([
      { match: '/api/account/custom-topics', body: custom },
      { match: '/api/feed', body: FEED },
      { match: '/api/issues', body: ISSUES },
    ])
    const user = { uid: 'reader', getIdToken: vi.fn().mockResolvedValue('verified-token') } as unknown as User
    render(
      <SessionContext.Provider value={{ user, loading: false, error: null, retry: () => {} }}>
        <MemoryRouter>
          <TopicFeed topicIds={[]} />
        </MemoryRouter>
      </SessionContext.Provider>,
    )

    if (feedRequested) expect(await screen.findByText('To expand hospital coverage')).toBeTruthy()
    else expect(await screen.findByText('No topics chosen yet')).toBeTruthy()
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('/api/feed'))).toBe(feedRequested)
  })
})
