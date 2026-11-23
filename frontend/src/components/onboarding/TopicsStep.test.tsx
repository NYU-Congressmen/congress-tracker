import { fireEvent, render, screen } from '@testing-library/react'
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
