export type ThemeMode = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'pull-theme'

export function readStoredTheme(): ThemeMode | null {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
    return stored === 'light' || stored === 'dark' ? stored : null
  } catch {
    return null
  }
}

export function storeTheme(mode: ThemeMode | null): void {
  try {
    if (mode === null) window.localStorage.removeItem(THEME_STORAGE_KEY)
    else window.localStorage.setItem(THEME_STORAGE_KEY, mode)
  } catch {
    // The choice still applies during this visit if storage is unavailable.
  }
}

export function applyTheme(mode: ThemeMode | null): void {
  if (mode === null) {
    delete document.documentElement.dataset.theme
  } else {
    document.documentElement.dataset.theme = mode
  }
}
