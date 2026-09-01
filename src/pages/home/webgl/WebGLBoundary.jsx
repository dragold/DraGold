import { Component } from "react";

// If anything in the WebGL layer throws (texture CORS failure, lost context,
// shader compile error on an odd GPU…), we silently drop back to the DOM Atlas.
// The 3D layer is always pure enhancement — a failure must never be visible.
export class WebGLBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    if (import.meta.env.DEV) console.warn("[Atlas WebGL] disabled after error:", error);
    this.props.onFail?.();
  }

  render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}
