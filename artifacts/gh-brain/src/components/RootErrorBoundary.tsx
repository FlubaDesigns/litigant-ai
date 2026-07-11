import { Component, type ErrorInfo, type ReactNode } from "react";

interface State {
  error: Error | null;
}

export class RootErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[RootErrorBoundary]", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#09090b",
          color: "#f4f4f5",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem",
          fontFamily: "system-ui, sans-serif",
          gap: "1.5rem",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: "2.5rem" }}>⚠</div>
        <h1 style={{ fontSize: "1.25rem", fontWeight: 700, margin: 0 }}>
          Something went wrong
        </h1>
        <pre
          style={{
            background: "#18181b",
            border: "1px solid #3f3f46",
            borderRadius: "0.5rem",
            padding: "1rem 1.25rem",
            fontSize: "0.75rem",
            color: "#f59e0b",
            maxWidth: "600px",
            width: "100%",
            overflowX: "auto",
            textAlign: "left",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {error.message}
          {"\n"}
          {error.stack?.split("\n").slice(1, 5).join("\n")}
        </pre>
        <button
          onClick={() => window.location.reload()}
          style={{
            background: "#f59e0b",
            color: "#000",
            border: "none",
            borderRadius: "0.5rem",
            padding: "0.6rem 1.5rem",
            fontWeight: 700,
            fontSize: "0.875rem",
            cursor: "pointer",
          }}
        >
          Reload page
        </button>
      </div>
    );
  }
}
