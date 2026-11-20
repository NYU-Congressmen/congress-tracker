import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// jsdom has no canvas. The dot header asks for a 2D context and draws nothing
// when there is none, so answer null instead of logging "not implemented".
HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext

// Runs after every test in every test file: unmount rendered React trees and
// restore any stubbed globals (fetch).
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
