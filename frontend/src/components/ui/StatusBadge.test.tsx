import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { StatusBadge } from './StatusBadge'

test('renders the human label for a bill stage', () => {
  render(<StatusBadge status="passed_both_chambers" />)
  const badge = screen.getByText('Passed both chambers')
  expect(badge).toBeTruthy()
  expect(badge.className).toContain('status-badge--passed_both_chambers')
})

test('renders an unknown stage verbatim', () => {
  render(<StatusBadge status={'mystery' as never} />)
  expect(screen.getByText('mystery')).toBeTruthy()
})
