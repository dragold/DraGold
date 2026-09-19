// Global error boundary for DraGold.
// Catches React errors anywhere in the tree and renders a fallback instead of
// crashing the page. The 3D/WebGL layer has its own finer-grained boundary
// (WebGLBoundary.jsx) — this one is for the whole app.
//
// Design notes:
// - We never show a blank white page. The fallback keeps the header/footer and
//   offers a reload button plus a "go home" link.
// - In development we log the error to console so it's visible during local work.
// - In production we log via the Vercel Analytics integration (if available) and
//   display a user-friendly message.
import { Component } from "react";
import { Icon } from "./Icon.jsx";

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    if (import.meta.env.DEV) {
      console.error("[DraGold ErrorBoundary] error caught:", error);
      console.error("[DraGold ErrorBoundary] component stack:", errorInfo?.componentStack);
    } else {
      // In production, log to console as a fallback (Vercel Analytics would also
      // capture unhandled errors). Keep the user-facing message clean.
      console.error("[DraGold] unexpected error:", error?.message || error);
    }
    this.props.onError?.(error, errorInfo);
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.reload();
  };

  handleGoHome = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.href = "/";
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    // Keep the visual identity even when something broke.
    return (
      <div className="error-boundary">
        <header className="error-boundary__header">
          <div className="error-boundary__brand">
            <img
              src="/logo192.png"
              alt="DraGold"
              className="error-boundary__logo"
            />
            <span className="error-boundary__brand-text">DraGold</span>
          </div>
        </header>

        <main className="error-boundary__main">
          <div className="error-boundary__card">
            <div className="error-boundary__icon">
              <Icon name="alert" size={32} stroke={2.5} />
            </div>
            <h1 className="error-boundary__title">Qualcosa è andato storto</h1>
            <p className="error-boundary__message">
              Si è verificato un errore inatteso. Raramente accade, ma quando
              accade è colpa nostra, non tua.
            </p>

            {/* In development we show the error for debugging. */}
            {import.meta.env.DEV && this.state.error && (
              <pre className="error-boundary__debug">
                <strong>Errore:</strong> {this.state.error.toString()}
                {this.state.errorInfo?.componentStack && (
                  <>
                    <br /><br />
                    <strong>Stack:</strong>
                    <br />
                    {this.state.errorInfo.componentStack}
                  </>
                )}
              </pre>
            )}

            <div className="error-boundary__actions">
              <button className="error-boundary__btn error-boundary__btn--primary" onClick={this.handleReload}>
                Ricarica la pagina
              </button>
              <button className="error-boundary__btn" onClick={this.handleGoHome}>
                Torna alla home
              </button>
            </div>
          </div>
        </main>

        <footer className="error-boundary__footer">
          <p>DraGold — TCG Collection Intelligence</p>
        </footer>
      </div>
    );
  }
}

export default ErrorBoundary;
