'use client'

import { Component, createRef, type ErrorInfo, type ReactNode } from 'react'
import { reportError } from '@/lib/error-reporter'

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
  private readonly alertRef = createRef<HTMLDivElement>()

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

  override componentDidUpdate(_prevProps: Props, prevState: State): void {
    if (!prevState.hasError && this.state.hasError) {
      this.alertRef.current?.focus()
    }
  }

  override render(): ReactNode {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div
            ref={this.alertRef}
            role="alert"
            tabIndex={-1}
            style={{
              padding: '2rem',
              textAlign: 'center',
              color: '#1a1a1a',
              backgroundColor: '#ffffff',
              outline: 'none',
            }}
          >
            <h2>An error occurred</h2>
            <p id="error-description">Something went wrong.</p>
            <button
              type="button"
              aria-describedby="error-description"
              onClick={() => window.location.reload()}
              style={{ outline: '2px solid #1a1a1a', outlineOffset: '2px' }}
            >
              Reload page
            </button>
          </div>
        )
      )
    }
    return this.props.children
  }
}
