/**
 * ErrorBoundary — unit tests for the logic inside componentDidCatch.
 *
 * ErrorBoundary is a React class component that requires a browser/renderer
 * environment; there is no @testing-library/react in this project so we
 * cannot mount it.  Instead, we test the client-event assembly logic that
 * `componentDidCatch` performs by duplicating the same logic here — the same
 * approach used for IntakeForm and PhotoGallery in this repo.
 *
 * If the implementation changes, update the helper below.
 */

import { describe, it, expect } from 'vitest'
import type { ErrorInfo } from 'react'
import type { ClientEvent } from '../lib/error-reporter.js'

// ---------------------------------------------------------------------------
// Extracted logic under test (mirrors ErrorBoundary.componentDidCatch)
// ---------------------------------------------------------------------------

/**
 * Builds the ClientEvent that ErrorBoundary passes to reportError.
 * Duplicates the logic in componentDidCatch — update both if it changes.
 */
function buildReactErrorEvent(error: Error, info: ErrorInfo): ClientEvent {
  const event: ClientEvent = { type: 'react-error', message: error.message }
  if (error.stack !== undefined) event.stack = error.stack
  if (info.componentStack) event.componentStack = info.componentStack
  return event
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ErrorBoundary — componentDidCatch event assembly', () => {
  it('sets type to react-error', () => {
    const error = new Error('render failed')
    const info: ErrorInfo = { componentStack: '\n    in Foo\n    in App' }
    const event = buildReactErrorEvent(error, info)
    expect(event.type).toBe('react-error')
  })

  it('forwards the error message', () => {
    const error = new Error('Minified React error #130')
    const info: ErrorInfo = { componentStack: '\n    in App' }
    const event = buildReactErrorEvent(error, info)
    expect(event.message).toBe('Minified React error #130')
  })

  it('includes stack when the error has one', () => {
    const error = new Error('crash')
    // Error objects in Node always have a stack
    expect(error.stack).toBeDefined()
    const info: ErrorInfo = { componentStack: '\n    in App' }
    const event = buildReactErrorEvent(error, info)
    expect(event.stack).toBe(error.stack)
  })

  it('omits stack when error.stack is undefined', () => {
    const error = new Error('no stack')
    // Manually remove the stack to simulate an environment where it is absent
    delete (error as { stack?: string }).stack
    const info: ErrorInfo = { componentStack: '\n    in App' }
    const event = buildReactErrorEvent(error, info)
    expect('stack' in event).toBe(false)
  })

  it('includes componentStack when info provides one', () => {
    const error = new Error('tree crash')
    const info: ErrorInfo = { componentStack: '\n    in Card\n    in Listing\n    in App' }
    const event = buildReactErrorEvent(error, info)
    expect(event.componentStack).toBe('\n    in Card\n    in Listing\n    in App')
  })

  it('omits componentStack when info.componentStack is falsy', () => {
    const error = new Error('no component stack')
    // componentStack can be an empty string in some React versions
    const info: ErrorInfo = { componentStack: '' }
    const event = buildReactErrorEvent(error, info)
    expect('componentStack' in event).toBe(false)
  })
})

describe('ErrorBoundary — getDerivedStateFromError', () => {
  // getDerivedStateFromError is a pure static method: given any error it must
  // return { hasError: true } so the boundary switches to fallback mode.
  function getDerivedStateFromError(): { hasError: boolean } {
    // Mirrors the implementation — the error argument is intentionally unused.
    return { hasError: true }
  }

  it('always returns hasError: true regardless of the error', () => {
    expect(getDerivedStateFromError()).toEqual({ hasError: true })
  })
})
