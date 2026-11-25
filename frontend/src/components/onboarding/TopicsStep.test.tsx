import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { mockApi } from '../../test/fetchMock'
import { TopicsStep } from './TopicsStep'

afterEach(() => vi.unstubAllGlobals())

test('suggests related topics and saves selections from the cloud and search', async () => {
  mockApi([{
    match: '/api/issues',
    body: [
      { issue_id: 7, name: 'Housing' },
      { issue_id: 11, name: 'Health care' },
      { issue_id: 20, name: 'Taxes' },
      { issue_id: 21, name: 'Retirement and Social Security' },
      { issue_id: 30, name: 'Immigration' },
      { issue_id: 35, name: 'Civil rights' },
      { issue_id: 36, name: 'Veterans' },
      { issue_id: 37, name: 'Public safety' },
    ],
  }])
  const save = vi.fn()
  render(<TopicsStep initial={[]} onDone={save} />)

  const health = await screen.findByRole('button', { name: 'Health care' })
  expect(screen.queryByRole('button', { name: 'Civil rights' })).toBeNull()
  fireEvent.click(health)
  expect(screen.getByRole('button', { name: 'Civil rights' })).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Taxes' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Retirement and Social Security' }))
  expect(screen.getByRole('button', { name: 'Taxes' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Civil rights' })).toBeTruthy()

  const search = screen.getByRole('searchbox', { name: 'Search topics' })
  fireEvent.change(search, { target: { value: 'immig' } })
  fireEvent.click(screen.getByRole('button', { name: 'Immigration' }))
  expect(screen.getByRole('button', { name: 'Public safety', pressed: false })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Health care', pressed: true })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Immigration', pressed: true })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Continue to social profiles' }))
  expect(save).toHaveBeenCalledWith([11, 21, 30])
})

test('prioritizes early-career topics and keeps saved choices available during search', async () => {
  mockApi([{
    match: '/api/issues',
    body: [
      { issue_id: 1, name: 'Climate and energy' },
      { issue_id: 2, name: 'Education' },
      { issue_id: 3, name: 'Health care' },
      { issue_id: 4, name: 'Housing' },
      { issue_id: 5, name: 'Jobs and wages' },
      { issue_id: 6, name: 'Technology and AI' },
      { issue_id: 7, name: 'Veterans' },
    ],
  }])
  const save = vi.fn()
  render(<TopicsStep initial={[7]} onDone={save} />)
  const suggested = await screen.findByRole('group', { name: 'Suggested topics' })
  expect(within(suggested).getAllByRole('button').slice(0, 5).map((button) => button.textContent))
    .toEqual(['Jobs and wages', 'Housing', 'Technology and AI', 'Education', 'Health care'])
  expect(within(suggested).getByRole('button', { name: 'Veterans', pressed: true })).toBeTruthy()

  fireEvent.change(screen.getByRole('searchbox', { name: 'Search topics' }), { target: { value: 'climate' } })
  const selections = screen.getByRole('group', { name: 'Selected topics outside the results' })
  fireEvent.click(within(selections).getByRole('button', { name: 'Veterans', pressed: true }))
  expect(screen.queryByRole('group', { name: 'Selected topics outside the results' })).toBeNull()
  fireEvent.click(within(screen.getByRole('group', { name: 'Search results' })).getByRole('button', { name: 'Climate and energy' }))
  fireEvent.click(screen.getByRole('button', { name: 'Continue to social profiles' }))
  expect(save).toHaveBeenCalledWith([1])
})
