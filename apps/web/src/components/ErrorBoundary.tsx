'use client'

import { Component, type ErrorInfo, type ReactNode } from 'react'
import { reportError } from '../lib/error-reporter.js'

interface Props {
  children: ReactNode
  /** Optional fallback UI. Defaults to a plain accessible error message. */
  fallback?: ReactNode
}

interface State {
  hasError: boolean
}

/**
 * React error boundary that catches render-phase errors in the subtree,
 * reports them to the ops log collector, and renders a fallback UI.
 *
 * Wrap the root app shell in the root layout so no render error goes silently
 * lost. Narrower boundaries (e.g. per-route) can be added incrementally.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    const event: Parameters<typeof reportError>[0] = { type: 'react-error', message: error.message }
    if (error.stack !== undefined) event.stack = error.stack
    if (info.componentStack) event.componentStack = info.componentStack
    reportError(event)
  }

  override render(): ReactNode {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div role="alert" style={{ padding: '2rem', textAlign: 'center' }}>
            <p>Something went wrong.</p>
            <button type="button" onClick={() => window.location.reload()}>
              Reload page
            </button>
          </div>
        )
      )
    }
    return this.props.children
  }
}
