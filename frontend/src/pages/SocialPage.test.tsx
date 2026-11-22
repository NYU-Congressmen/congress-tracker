import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { User } from '@firebase/auth'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { SessionContext } from '../auth/SessionContext'
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

function renderSocial(
  routes: { match: string; body: unknown; status?: number }[] = [],
  user: User | null = null,
  path = '/social',
) {
  const fetchMock = mockApi([
    ...routes,
    { match: '/api/bills/119/hr/7', body: BILL },
    { match: '/api/bills', body: BILL_PAGE },
  ])
  const result = render(
    <SessionContext.Provider value={{ user, loading: false, error: null, retry: () => {} }}>
      <MemoryRouter initialEntries={[path]}>
        <SocialPage />
      </MemoryRouter>
    </SessionContext.Provider>,
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

  test('keeps a draft written before bill selection and saves it to discussions', async () => {
    renderSocial([
      { match: '/api/bills/119/hr/7/review', body: { detail: 'Sign in to continue' }, status: 401 },
    ])

    fireEvent.click(screen.getByRole('radio', { name: 'Support' }))
    fireEvent.change(screen.getByLabelText(/your story/i), {
      target: { value: 'My family used this service.' },
    })

    const search = screen.getByPlaceholderText(/search by keyword/i)
    fireEvent.change(search, { target: { value: 'hospital' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search bills' }))

    const billChoice = await screen.findByRole('button', { name: /To expand hospital coverage/ })
    fireEvent.click(billChoice)

    expect(screen.getByDisplayValue('My family used this service.')).toBeTruthy()
    fireEvent.click(await screen.findByRole('button', { name: 'Save my stance' }))

    // A signed-out visitor saves a browser draft.
    expect(
      await screen.findByText(/draft saved in this browser/i),
    ).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Back to bill' })).toBeNull()
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

  test.each([true, false])('opens the linked bill and changes saved brief consent (%s)', async (initialConsent) => {
    const review = {
      bill_id: '119-hr-7',
      stance: 'support',
      story: 'My family used this service.',
      action_taken: null,
      consent_to_share: initialConsent,
      share_publicly: true,
      created_at: '2026-11-11T12:00:00Z',
      updated_at: '2026-11-11T12:00:00Z',
    }
    const user = { uid: 'reviewer', getIdToken: vi.fn().mockResolvedValue('test-id-token') } as unknown as User
    const { fetchMock } = renderSocial(
      [{ match: '/api/bills/119/hr/7/review', body: review }],
      user,
      '/social?bill=119-hr-7#bill-review',
    )
    expect(await screen.findByDisplayValue('My family used this service.')).toBeTruthy()
    const consent = screen.getByRole('checkbox', { name: /Constituent Signal brief/i })
    expect((consent as HTMLInputElement).checked).toBe(initialConsent)
    const publication = screen.getByRole<HTMLInputElement>('checkbox', { name: /Publish my stance/i })
    expect(publication.checked).toBe(true)
    fireEvent.click(consent)
    fireEvent.click(await screen.findByRole('button', { name: 'Save my stance' }))

    expect(await screen.findByText(/Your review is saved/i)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Back to bill' }).getAttribute('href')).toBe('/bills/119/hr/7')
    expect(fetchMock).toHaveBeenCalledWith('/api/bills/119/hr/7/review', expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer test-id-token' }),
      method: 'PUT',
      body: JSON.stringify({
        stance: 'support',
        story: review.story,
        action_taken: null,
        consent_to_share: !initialConsent,
        share_publicly: true,
      }),
    }))
    await waitFor(() => {
      expect(screen.getByText('Saved')).toBeTruthy()
    })
    fireEvent.click(screen.getByRole('button', { name: 'Change bill' }))
    expect(screen.getByRole('searchbox', { name: 'Find a bill' })).toBeTruthy()
    expect(screen.queryByRole('checkbox', { name: /Constituent Signal brief/i })).toBeNull()
  })

  test('shows unchecked consent for a linked bill without a saved review', async () => {
    const user = { uid: 'reviewer', getIdToken: vi.fn().mockResolvedValue('test-id-token') } as unknown as User
    renderSocial(
      [{ match: '/api/bills/119/hr/7/review', body: { detail: 'No review found' }, status: 404 }],
      user,
      '/social?bill=119-hr-7#bill-review',
    )
    const consent = await screen.findByRole<HTMLInputElement>('checkbox', { name: /Constituent Signal brief/i })
    await waitFor(() => expect(consent.disabled).toBe(false))
    expect(consent.checked).toBe(false)
  })
})
