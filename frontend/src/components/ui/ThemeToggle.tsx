import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { ChevronRightIcon, MoonIcon, SunIcon } from '../icons'
import { applyTheme, readStoredTheme, storeTheme, type ThemeMode } from '../../lib/theme'

const DARK_SCHEME = '(prefers-color-scheme: dark)'

function subscribeToSystemTheme(onChange: () => void): () => void {
  const scheme = window.matchMedia?.(DARK_SCHEME)
  scheme?.addEventListener('change', onChange)
  return () => scheme?.removeEventListener('change', onChange)
}

function systemIsDark(): boolean {
  return window.matchMedia?.(DARK_SCHEME).matches ?? false
}

export function ThemeToggle() {
  const [preference, setPreference] = useState(readStoredTheme)
  const prefersDark = useSyncExternalStore(subscribeToSystemTheme, systemIsDark)
  const options = useRef<HTMLDetailsElement>(null)
  const arrow = useRef<HTMLElement>(null)

  useEffect(() => {
    applyTheme(preference)
  }, [preference])

  useEffect(() => {
    function dismissOutside(event: PointerEvent) {
      const disclosure = options.current
      if (disclosure?.open && event.target instanceof Node && !disclosure.contains(event.target)) {
        disclosure.open = false
      }
    }

    document.addEventListener('pointerdown', dismissOutside)
    return () => document.removeEventListener('pointerdown', dismissOutside)
  }, [])

  const current = preference ?? (prefersDark ? 'dark' : 'light')
  const next: ThemeMode = current === 'dark' ? 'light' : 'dark'
  const label = next === 'light' ? 'Switch to Day' : 'Switch to Night'

  function chooseTheme(mode: ThemeMode | null) {
    setPreference(mode)
    storeTheme(mode)
  }

  function closeOptions() {
    if (options.current) options.current.open = false
    arrow.current?.focus()
  }

  return (
    <div className="theme-control">
      <button
        type="button"
        className="theme-toggle"
        aria-label={label}
        title={label}
        onClick={() => chooseTheme(next)}
      >
        {next === 'light' ? <SunIcon /> : <MoonIcon />}
      </button>
      <details
        className="theme-options"
        ref={options}
        onBlur={(event) => {
          if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) {
            event.currentTarget.open = false
          }
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && event.currentTarget.open) {
            event.preventDefault()
            closeOptions()
          }
        }}
      >
        <summary ref={arrow} aria-label="Appearance options" title="Appearance options">
          <ChevronRightIcon size={14} className="theme-options__arrow" />
        </summary>
        <div className="theme-options__panel">
          <button className="btn btn--ghost btn--sm" type="button" onClick={() => {
            chooseTheme(null)
            closeOptions()
          }}>
            Follow device
          </button>
        </div>
      </details>
    </div>
  )
}
