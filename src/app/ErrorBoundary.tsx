import { Component, type ErrorInfo, type ReactNode } from 'react';
import { fa } from '@/i18n/fa';
import { Button } from '@/components/ui/button';
import { logError } from './errorLog';

interface Props {
  children: ReactNode;
}

interface State {
  message?: string;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = {};

  static getDerivedStateFromError(error: unknown): State {
    return { message: error instanceof Error ? error.message : String(error) };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    logError({ message: error.message, stack: `${error.stack ?? ''}\n${info.componentStack ?? ''}`, context: 'react' });
  }

  override render(): ReactNode {
    if (!this.state.message) return this.props.children;
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-heading font-bold text-ink">{fa.errors.title}</h1>
        <p className="max-w-[28rem] text-crate">{fa.errors.body}</p>
        <p dir="ltr" className="max-w-full overflow-x-auto text-[0.8rem] text-crate">
          {this.state.message}
        </p>
        <Button onClick={() => window.location.reload()}>{fa.errors.reload}</Button>
      </div>
    );
  }
}
