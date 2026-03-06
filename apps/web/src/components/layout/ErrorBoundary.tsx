import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error('[ErrorBoundary] Render error:', error, info.componentStack);
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center py-20 px-6 gap-4 text-center">
          <p className="text-2xl">⚠️</p>
          <h2 className="text-lg font-semibold">Fehler beim Laden der Seite</h2>
          <p className="text-sm text-muted-foreground max-w-md">
            {this.state.error?.message ?? 'Unbekannter Fehler'}
          </p>
          <button
            className="mt-2 text-sm text-primary underline underline-offset-4"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Erneut versuchen
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
