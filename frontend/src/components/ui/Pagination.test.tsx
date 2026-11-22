import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { Pagination } from './Pagination'

test('navigates to a numbered page', () => {
  const onPageChange = vi.fn()
  render(<Pagination page={2} pageCount={5} onPageChange={onPageChange} />)

  fireEvent.click(screen.getByRole('button', { name: '3' }))
  expect(onPageChange).toHaveBeenCalledWith(3)
})

test('hides itself when there is a single page', () => {
  const { container } = render(<Pagination page={1} pageCount={1} onPageChange={() => {}} />)
  expect(container.querySelector('nav')).toBeNull()
})

test('disables previous on the first page', () => {
  render(<Pagination page={1} pageCount={3} onPageChange={() => {}} />)
  expect((screen.getByRole('button', { name: /Previous/ }) as HTMLButtonElement).disabled).toBe(true)
})

test('disables next on the last page', () => {
  render(<Pagination page={3} pageCount={3} onPageChange={() => {}} />)
  expect((screen.getByRole('button', { name: /Next/ }) as HTMLButtonElement).disabled).toBe(true)
})
