import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// Runs after every test in every test file: unmount rendered React trees and
// restore any stubbed globals (fetch).
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
