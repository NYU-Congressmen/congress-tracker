import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'
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
})
