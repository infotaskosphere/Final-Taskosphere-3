import React from 'react';

/*
 * The app previously had NO error boundary anywhere. If a routed page threw
 * during render, React 18 would unmount silently (console-only) and — since
 * nothing ever remounted it — the content area stayed blank for the rest of
 * the session, even for completely unrelated pages navigated to afterwards.
 *
 * This boundary is reset on every route change (via the `resetKey` prop —
 * pass `location.pathname` or similar), so a crash on one page doesn't take
 * down every page after it: navigating away remounts a fresh boundary.
 */
export default class RouteErrorBoundary extends React.Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('Route render error:', error, info?.componentStack);
  }

  componentDidUpdate(prevProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '60vh',
            width: '100%',
            textAlign: 'center',
            gap: 12,
            padding: 24,
          }}
        >
          <p style={{ fontSize: 16, fontWeight: 600 }}>This page hit an error.</p>
          <p style={{ fontSize: 13, opacity: 0.7, maxWidth: 480 }}>
            {this.state.error?.message || 'Something went wrong loading this page.'}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              background: '#1F6FB2',
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Reload page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
