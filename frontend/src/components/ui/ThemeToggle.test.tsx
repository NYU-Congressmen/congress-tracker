import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { ThemeToggle } from './ThemeToggle'
import { THEME_STORAGE_KEY } from '../../lib/theme'

function themeAttribute(): string | undefined {
  return document.documentElement.dataset.theme
}

function clickToggle(): void {
  act(() => {
    screen.getByRole('button', { name: /theme/i }).click()
  })
}

beforeEach(() => {
  window.localStorage.clear()
  delete document.documentElement.dataset.theme
})

afterEach(() => {
  delete document.documentElement.dataset.theme
})

describe('ThemeToggle', () => {
  test('defaults to auto, following the system setting', () => {
    render(<ThemeToggle />)

    expect(themeAttribute()).toBeUndefined()
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('auto')
  })

  test('cycles light, then dark, then back to auto', () => {
    render(<ThemeToggle />)

    clickToggle()
    expect(themeAttribute()).toBe('light')
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light')

    clickToggle()
    expect(themeAttribute()).toBe('dark')
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')

    clickToggle()
    expect(themeAttribute()).toBeUndefined()
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('auto')
  })

  test('restores a stored dark theme on mount', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark')

    render(<ThemeToggle />)

    expect(themeAttribute()).toBe('dark')
  })

  test('restores a stored light theme on mount', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'light')

    render(<ThemeToggle />)

    expect(themeAttribute()).toBe('light')
  })

  test('ignores an invalid stored value and falls back to auto', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'neon')

    render(<ThemeToggle />)

    expect(themeAttribute()).toBeUndefined()
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('auto')
  })
})
