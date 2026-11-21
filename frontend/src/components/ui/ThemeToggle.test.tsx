import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { ThemeToggle } from './ThemeToggle'
import { THEME_STORAGE_KEY } from '../../lib/theme'

function mockSystemTheme(isDark: boolean) {
  const media = new EventTarget()
  Object.assign(media, { matches: isDark })
  vi.stubGlobal('matchMedia', () => media)
  return (matches: boolean) => {
    Object.assign(media, { matches })
    media.dispatchEvent(Object.assign(new Event('change'), { matches }))
  }
}

beforeEach(() => {
  window.localStorage.clear()
  delete document.documentElement.dataset.theme
})

afterEach(() => {
  vi.unstubAllGlobals()
  delete document.documentElement.dataset.theme
})

describe('ThemeToggle', () => {
  test.each([
    [false, 'Night'],
    [true, 'Day'],
  ])('offers the opposite theme when the system dark setting is %s', (isDark, next) => {
    mockSystemTheme(isDark)
    render(<ThemeToggle />)

    expect(screen.getByRole('button', { name: `Switch to ${next}` })).toBeTruthy()
    expect(document.documentElement.dataset.theme).toBeUndefined()
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull()
  })

  test('switches between Day and Night and saves the explicit choice', () => {
    mockSystemTheme(true)
    render(<ThemeToggle />)

    fireEvent.click(screen.getByRole('button', { name: 'Switch to Day' }))
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light')

    fireEvent.click(screen.getByRole('button', { name: 'Switch to Night' }))
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
    expect(screen.getByRole('button', { name: 'Switch to Day' })).toBeTruthy()
  })

  test('follows changes to the system theme until the visitor makes a choice', () => {
    const setSystemDark = mockSystemTheme(false)
    render(<ThemeToggle />)

    act(() => setSystemDark(true))
    fireEvent.click(screen.getByRole('button', { name: 'Switch to Day' }))
    act(() => setSystemDark(false))
    act(() => setSystemDark(true))
    expect(screen.getByRole('button', { name: 'Switch to Night' })).toBeTruthy()
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  test('clears the saved theme and resumes device changes from the dropdown', () => {
    const setSystemDark = mockSystemTheme(false)
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark')
    render(<ThemeToggle />)

    const options = screen.getByLabelText('Appearance options')
    fireEvent.click(options)
    fireEvent.click(screen.getByRole('button', { name: 'Follow device' }))

    expect(options.closest('details')?.open).toBe(false)
    expect(document.activeElement).toBe(options)
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull()
    expect(document.documentElement.dataset.theme).toBeUndefined()
    expect(screen.getByRole('button', { name: 'Switch to Night' })).toBeTruthy()

    act(() => setSystemDark(true))
    expect(screen.getByRole('button', { name: 'Switch to Day' })).toBeTruthy()
  })

  test('closes the dropdown on Escape and returns focus to the arrow', () => {
    render(<ThemeToggle />)

    const options = screen.getByLabelText('Appearance options')
    fireEvent.click(options)
    const followDevice = screen.getByRole('button', { name: 'Follow device' })
    followDevice.focus()
    fireEvent.keyDown(followDevice, { key: 'Escape' })

    expect(options.closest('details')?.open).toBe(false)
    expect(document.activeElement).toBe(options)
  })

  test.each([
    ['light', 'Night'],
    ['dark', 'Day'],
  ])('restores a saved %s theme', (stored, next) => {
    window.localStorage.setItem(THEME_STORAGE_KEY, stored)
    render(<ThemeToggle />)

    expect(document.documentElement.dataset.theme).toBe(stored)
    expect(screen.getByRole('button', { name: `Switch to ${next}` })).toBeTruthy()
  })

  test.each(['auto', 'neon'])('follows the system when the saved value is %s', (stored) => {
    mockSystemTheme(true)
    window.localStorage.setItem(THEME_STORAGE_KEY, stored)
    render(<ThemeToggle />)

    expect(document.documentElement.dataset.theme).toBeUndefined()
    expect(screen.getByRole('button', { name: 'Switch to Day' })).toBeTruthy()
  })
})
