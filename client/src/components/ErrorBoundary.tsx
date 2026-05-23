import React from "react";

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ReactNode },
  State
> {
  constructor(props: { children: React.ReactNode; fallback?: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="flex flex-col items-center justify-center min-h-[200px] gap-4 p-8 text-center">
            <p className="text-lg font-medium text-red-600">오류가 발생했습니다</p>
            <p className="text-sm text-gray-500">{this.state.error?.message}</p>
            <button
              onClick={() => this.setState({ hasError: false })}
              className="px-4 py-2 bg-cream-700 text-white rounded-lg text-sm hover:bg-cream-800"
            >
              다시 시도
            </button>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
