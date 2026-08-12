"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { hasError: boolean };

export class AdminDeferredErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // The deferred panel must fail locally; do not log panel data or tokens.
    void error;
    void info;
  }

  render() {
    if (this.state.hasError) {
      return <section className="admin-card" role="alert"><h2>管理区暂时没有打开</h2><p>个人摘要仍可使用；管理数据稍后可以单独重试。</p><button className="primary-button" type="button" onClick={() => this.setState({ hasError: false })}>重试管理区</button></section>;
    }
    return this.props.children;
  }
}
