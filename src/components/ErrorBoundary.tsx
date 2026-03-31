import React from 'react'

interface Props {
  children: React.ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '20px', background: '#fee', borderRadius: '8px', color: '#c33' }}>
          <p><strong>Erreur du composant:</strong></p>
          <pre style={{ fontSize: '12px', overflow: 'auto' }}>{this.state.error?.toString()}</pre>
        </div>
      )
    }

    return this.props.children
  }
}
