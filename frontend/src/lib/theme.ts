// Theme preference: 'auto' follows the OS/browser setting (the default),
// while 'light' and 'dark' force a palette. The choice is stored in
// localStorage and applied to <html data-theme>, and index.css keys the dark
// token map on that attribute.

export type ThemeMode = 'auto' | 'light' | 'dark'

export const THEME_STORAGE_KEY = 'congress-tracker-theme'

const NEXT_MODE: Record<ThemeMode, ThemeMode> = { auto: 'light', light: 'dark', dark: 'auto' }

export const MODE_LABELS: Record<ThemeMode, string> = {
  auto: 'Auto (follow system)',
  light: 'Light',
  dark: 'Dark',
}

export function nextThemeMode(mode: ThemeMode): ThemeMode {
  return NEXT_MODE[mode]
}

export function isThemeMode(value: string | null): value is ThemeMode {
  return value === 'auto' || value === 'light' || value === 'dark'
}

export function readStoredTheme(): ThemeMode {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
    return isThemeMode(stored) ? stored : 'auto'
  } catch {
    return 'auto'
  }
}

export function storeTheme(mode: ThemeMode): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, mode)
  } catch {
    // Storage can be unavailable in private browsing, but the choice still
    // applies for this visit.
  }
}

// 'auto' removes the attribute so the CSS falls back to the system setting.
export function applyTheme(mode: ThemeMode): void {
  if (mode === 'auto') {
    delete document.documentElement.dataset.theme
  } else {
    document.documentElement.dataset.theme = mode
  }
}
