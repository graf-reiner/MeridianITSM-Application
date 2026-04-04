'use client';

import React from 'react';

interface Props {
  children: React.ReactNode;
  fallbackUrl?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '400px',
          padding: 40,
          fontFamily: 'system-ui, sans-serif',
        }}>
          <div style={{ textAlign: 'center', maxWidth: 420 }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
            <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>
              Something went wrong
            </h2>
            <p style={{ margin: '0 0 24px', fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.6 }}>
              An unexpected error occurred. You can try again or go back to the dashboard.
            </p>
            {this.state.error && (
              <pre style={{
                margin: '0 0 24px',
                padding: '12px 16px',
                backgroundColor: 'var(--bg-tertiary)',
                borderRadius: 8,
                fontSize: 12,
                color: 'var(--accent-danger)',
                textAlign: 'left',
                overflow: 'auto',
                maxHeight: 120,
              }}>
                {this.state.error.message}
              </pre>
            )}
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button
                onClick={() => this.setState({ hasError: false, error: null })}
                style={{
                  padding: '9px 20px',
                  backgroundColor: 'var(--accent-primary)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Try again
              </button>
              <a
                href={this.props.fallbackUrl ?? '/dashboard'}
                style={{
                  padding: '9px 20px',
                  backgroundColor: 'var(--bg-tertiary)',
                  color: 'var(--text-secondary)',
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 500,
                  textDecoration: 'none',
                  display: 'inline-block',
                }}
              >
                Go to Dashboard
              </a>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
