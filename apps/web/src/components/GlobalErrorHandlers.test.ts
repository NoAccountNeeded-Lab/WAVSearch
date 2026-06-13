/**
 * GlobalErrorHandlers — unit tests for the event-handler logic.
 *
 * GlobalErrorHandlers mounts global browser event listeners inside a
 * useEffect; there is no @testing-library/react available in this project.
 * We test the pure handler logic (event → ClientEvent mapping) by duplicating
 * it here — the same pattern used for IntakeForm and PhotoGallery.
 * Update this file if the implementation changes.
 */

import { describe, it, expect } from 'vitest'
import type { ClientEvent } from '../lib/error-reporter.js'

// ---------------------------------------------------------------------------
// Extracted logic under test (mirrors the handlers in GlobalErrorHandlers)
// ---------------------------------------------------------------------------

/**
 * Mirrors handleError inside GlobalErrorHandlers.useEffect.
 * Transforms a browser ErrorEvent into a ClientEvent for reportError.
 */
function buildJsErrorEvent(event: { message: string; error: unknown }): ClientEvent {
  const e: ClientEvent = { type: 'js-error', message: event.message }
  if (event.error instanceof Error && event.error.stack !== undefined) {
    e.stack = event.error.stack
  }
  return e
}

/**
 * Mirrors handleUnhandledRejection inside GlobalErrorHandlers.useEffect.
 * Transforms a browser PromiseRejectionEvent into a ClientEvent.
 */
function buildRejectionEvent(reason: unknown): ClientEvent {
  const message =
    reason instanceof Error
      ? reason.message
      : typeof reason === 'string'
        ? reason
        : '[unhandled rejection]'

  const e: ClientEvent = { type: 'unhandled-rejection', message }
  if (reason instanceof Error && reason.stack !== undefined) {
    e.stack = reason.stack
  }
  return e
}

// ---------------------------------------------------------------------------
// handleError (window.onerror / 'error' event)
// ---------------------------------------------------------------------------

describe('GlobalErrorHandlers — handleError', () => {
  it('sets type to js-error', () => {
    const event = buildJsErrorEvent({ message: 'boom', error: new Error('boom') })
    expect(event.type).toBe('js-error')
  })

  it('uses the event message as the ClientEvent message', () => {
    const event = buildJsErrorEvent({
      message: 'Cannot read properties of undefined',
      error: new Error('Cannot read properties of undefined'),
    })
    expect(event.message).toBe('Cannot read properties of undefined')
  })

  it('includes stack when error is an Error with a stack', () => {
    const error = new Error('crash')
    const event = buildJsErrorEvent({ message: error.message, error })
    expect(event.stack).toBe(error.stack)
  })

  it('omits stack when the error event carries a non-Error value', () => {
    const event = buildJsErrorEvent({ message: 'script error', error: 'plain string' })
    expect('stack' in event).toBe(false)
  })

  it('omits stack when event.error is null', () => {
    const event = buildJsErrorEvent({ message: 'script error', error: null })
    expect('stack' in event).toBe(false)
  })

  it('omits stack when the Error object has stack undefined', () => {
    const error = new Error('no stack') as Error & { stack?: string }
    delete error.stack
    const event = buildJsErrorEvent({ message: error.message, error })
    expect('stack' in event).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// handleUnhandledRejection (window.onunhandledrejection)
// ---------------------------------------------------------------------------

describe('GlobalErrorHandlers — handleUnhandledRejection', () => {
  it('sets type to unhandled-rejection', () => {
    const event = buildRejectionEvent(new Error('promise failed'))
    expect(event.type).toBe('unhandled-rejection')
  })

  it('uses Error.message when reason is an Error', () => {
    const reason = new Error('async task failed')
    const event = buildRejectionEvent(reason)
    expect(event.message).toBe('async task failed')
  })

  it('uses the string directly when reason is a string', () => {
    const event = buildRejectionEvent('quota exceeded')
    expect(event.message).toBe('quota exceeded')
  })

  it('uses sentinel message when reason is neither Error nor string', () => {
    const event = buildRejectionEvent({ code: 42 })
    expect(event.message).toBe('[unhandled rejection]')
  })

  it('uses sentinel message when reason is null', () => {
    const event = buildRejectionEvent(null)
    expect(event.message).toBe('[unhandled rejection]')
  })

  it('uses sentinel message when reason is undefined', () => {
    const event = buildRejectionEvent(undefined)
    expect(event.message).toBe('[unhandled rejection]')
  })

  it('uses sentinel message when reason is a number', () => {
    const event = buildRejectionEvent(0)
    expect(event.message).toBe('[unhandled rejection]')
  })

  it('includes stack when reason is an Error with a stack', () => {
    const reason = new Error('db timeout')
    const event = buildRejectionEvent(reason)
    expect(event.stack).toBe(reason.stack)
  })

  it('omits stack when reason is a string', () => {
    const event = buildRejectionEvent('something went wrong')
    expect('stack' in event).toBe(false)
  })

  it('omits stack when reason is a plain object', () => {
    const event = buildRejectionEvent({ status: 500 })
    expect('stack' in event).toBe(false)
  })

  it('omits stack when the Error object has stack undefined', () => {
    const reason = new Error('no stack') as Error & { stack?: string }
    delete reason.stack
    const event = buildRejectionEvent(reason)
    expect('stack' in event).toBe(false)
  })
})
