import React from 'react';

interface Props { children: React.ReactNode; }
interface State { error: Error | null; }

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          height: '100vh', background: '#080808', color: '#f0f0f0', padding: 40, gap: 16,
          fontFamily: "'Outfit', system-ui, sans-serif",
        }}>
          <div style={{ fontSize: 32 }}>⚠</div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Something went wrong</div>
          <pre style={{
            background: '#161616', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8,
            padding: '12px 16px', fontSize: 12, color: '#ef4444', maxWidth: 600, overflowX: 'auto',
            whiteSpace: 'pre-wrap', wordBreak: 'break-all',
          }}>
            {this.state.error.message}
            {'\n\n'}
            {this.state.error.stack?.slice(0, 800)}
          </pre>
          <button
            onClick={() => { this.setState({ error: null }); window.location.reload(); }}
            style={{
              background: '#22c55e', color: '#080808', border: 'none', borderRadius: 8,
              padding: '10px 20px', fontWeight: 700, cursor: 'pointer', fontSize: 14,
            }}
          >
            Reload App
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
