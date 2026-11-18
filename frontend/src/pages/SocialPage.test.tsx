import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'
import SocialPage from './SocialPage'
import { listDiscussions, recordDiscussion } from '../social/drafts'
import { mockApi } from '../test/fetchMock'

const BILL_PAGE = {
  total: 1,
  page: 1,
  limit: 6,
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

const BILL = {
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
  policy_area: 'Health',
  sponsor_id: null,
  sponsor: null,
  actions: [],
  cache: { complete: true, stale: false, refreshed_at: null, refresh_failed: false, retry_after: null },
}

function renderSocial(routes: { match: string; body: unknown; status?: number }[] = []) {
  const fetchMock = mockApi([
    ...routes,
    { match: '/api/bills/119/hr/7', body: BILL },
    { match: '/api/bills', body: BILL_PAGE },
  ])
  const result = render(
    <MemoryRouter initialEntries={['/social']}>
      <SocialPage />
    </MemoryRouter>,
  )
  return { result, fetchMock }
}

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('SocialPage', () => {
  test('connects a social profile and shows it in the list', async () => {
    renderSocial()

    expect(await screen.findByRole('heading', { name: 'Your social profiles' })).toBeTruthy()
    const input = screen.getByLabelText(/handle or profile/i)
    fireEvent.change(input, { target: { value: 'maya.bsky.social' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add handle' }))

    expect(await screen.findByText('maya.bsky.social')).toBeTruthy()
  })

  test('finds a bill, saves the stance, and lists the discussion', async () => {
    renderSocial([
      { match: '/api/bills/119/hr/7/review', body: { detail: 'Sign in to continue' }, status: 401 },
    ])

    // Find the bill
    const search = screen.getByPlaceholderText(/search by keyword/i)
    fireEvent.change(search, { target: { value: 'hospital' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search bills' }))

    const billChoice = await screen.findByRole('button', { name: /To expand hospital coverage/ })
    fireEvent.click(billChoice)

    // Weigh in
    fireEvent.click(screen.getByRole('radio', { name: 'Support' }))
    fireEvent.change(screen.getByPlaceholderText(/what does this bill mean/i), {
      target: { value: 'My family used this service.' },
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Save my stance' }))

    // The backend sign-in is not live, so the review lands as a local draft
    expect(
      await screen.findByText(/draft saved in this browser/i),
    ).toBeTruthy()
    const discussions = await screen.findByText('Your discussions', { selector: 'h2' })
    expect(discussions).toBeTruthy()
    expect(screen.getAllByText('To expand hospital coverage').length).toBeGreaterThan(1)
    expect(screen.getByText('Draft')).toBeTruthy()
  })

  test('keeps discussion drafts with their local profile', () => {
    recordDiscussion('maya', {
      bill: { congress: 119, type: 'hr', number: 7, title: BILL.title },
      stance: 'support',
      story: 'My family used this service.',
      action_taken: null,
      consent: false,
      saved: false,
      at: '2026-11-11T12:00:00Z',
    })

    expect(listDiscussions('maya')).toHaveLength(1)
    expect(listDiscussions('sam')).toHaveLength(0)
    expect(listDiscussions(null)).toHaveLength(0)
  })

  test('reports a saved review when the backend accepts it', async () => {
    const review = {
      bill_id: '119-hr-7',
      stance: 'support',
      story: 'My family used this service.',
      action_taken: null,
      consent_to_share: false,
      created_at: '2026-11-11T12:00:00Z',
      updated_at: '2026-11-11T12:00:00Z',
    }
    renderSocial([{ match: '/api/bills/119/hr/7/review', body: review }])

    const search = screen.getByPlaceholderText(/search by keyword/i)
    fireEvent.change(search, { target: { value: 'hospital' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search bills' }))
    fireEvent.click(await screen.findByRole('button', { name: /To expand hospital coverage/ }))
    fireEvent.click(screen.getByRole('radio', { name: 'Oppose' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Save my stance' }))

    expect(await screen.findByText(/Your review is saved/i)).toBeTruthy()
    await waitFor(() => {
      expect(screen.getByText('Saved')).toBeTruthy()
    })
  })
})
