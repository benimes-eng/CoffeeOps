import React, { Component, ErrorInfo, ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught runtime error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
          <div className="max-w-md bg-card border border-destructive/30 rounded-2xl p-8 card-shadow space-y-4">
            <h1 className="text-xl font-serif text-destructive">Application Error</h1>
            <p className="text-sm text-muted-foreground">
              An unexpected error occurred. Reload the application, and contact support if the issue persists.
            </p>
            <div className="pt-2 flex gap-3 justify-center">
              <Button
                variant="outline"
                onClick={() => {
                  Object.keys(localStorage)
                    .filter((key) => key.startsWith("sb-") || key.startsWith("coffeeops"))
                    .forEach((key) => localStorage.removeItem(key));
                  window.location.href = "/auth";
                }}
              >
                Clear Cache & Reset
              </Button>
              <Button onClick={() => window.location.reload()}>Reload Page</Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
