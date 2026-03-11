'use client';

import React, { Component, ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex items-center justify-center h-full min-h-[200px] bg-blue-50 rounded-lg">
          <div className="text-center p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-2">
              Failed to load component
            </h3>
            <p className="text-gray-600 mb-4 text-sm">
              This section encountered an error. The rest of the app should still work.
            </p>
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <p className="text-xs text-red-600 bg-red-50 rounded p-2 mb-3 text-left font-mono break-words">
                {this.state.error.message}
              </p>
            )}
            <button
              onClick={this.handleRetry}
              className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
