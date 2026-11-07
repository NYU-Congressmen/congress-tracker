import { useEffect, useState } from 'react'
import { AutoIcon, MoonIcon, SunIcon } from '../icons'
import {
  MODE_LABELS,
  applyTheme,
  nextThemeMode,
  readStoredTheme,
  storeTheme,
  type ThemeMode,
} from '../../lib/theme'

// Cycles Auto -> Light -> Dark and persists the choice, overriding the
// native prefers-color-scheme behavior. The icon shows the current mode.
export function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>(() => readStoredTheme())

  useEffect(() => {
    applyTheme(mode)
    storeTheme(mode)
  }, [mode])

  const next = nextThemeMode(mode)
  const label = `Theme: ${MODE_LABELS[mode]}. Switch to ${MODE_LABELS[next]}.`

  return (
    <button
      type="button"
      className="theme-toggle"
      aria-label={label}
      title={label}
      onClick={() => setMode(next)}
    >
      {mode === 'light' ? <SunIcon /> : mode === 'dark' ? <MoonIcon /> : <AutoIcon />}
      <span className="sr-only">Toggle color theme</span>
    </button>
  )
}
