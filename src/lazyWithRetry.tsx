import React, { Component, ComponentType, lazy, ReactNode } from 'react';

const RELOAD_STORAGE_KEY = 'vibe_lazy_chunk_reload_at';
const RELOAD_COOLDOWN_MS = 10_000;

function isDynamicImportError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? `${error.name} ${error.message}`
      : typeof error === 'string'
        ? error
        : '';
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Loading chunk|ChunkLoadError|Unable to preload CSS/i.test(
    message,
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wraps React.lazy with transient retry backoff and a guarded single reload
 * when stale dev/PWA chunk URLs fail after a server restart or deployment.
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  importer: () => Promise<{ default: T }>,
  retries = 2,
): React.LazyExoticComponent<T> {
  return lazy(async () => {
    let lastError: unknown;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await importer();
      } catch (err) {
        lastError = err;
        if (!isDynamicImportError(err)) {
          throw err;
        }
        if (attempt < retries) {
          await sleep(250 * (attempt + 1) * (attempt + 1));
        }
      }
    }

    if (
      typeof window !== 'undefined' &&
      typeof sessionStorage !== 'undefined' &&
      isDynamicImportError(lastError)
    ) {
      try {
        const lastReloadRaw = sessionStorage.getItem(RELOAD_STORAGE_KEY);
        const lastReload = lastReloadRaw ? Number(lastReloadRaw) : 0;
        const now = Date.now();
        if (!Number.isFinite(lastReload) || now - lastReload > RELOAD_COOLDOWN_MS) {
          sessionStorage.setItem(RELOAD_STORAGE_KEY, String(now));
          window.location.reload();
          return new Promise<{ default: T }>(() => {});
        }
      } catch {
        // Ignore sessionStorage restrictions in private browsing
      }
    }

    throw lastError;
  });
}

interface LazyErrorBoundaryProps {
  children: ReactNode;
  onReset?: () => void;
}

interface LazyErrorBoundaryState {
  hasError: boolean;
}

export class LazyErrorBoundary extends Component<LazyErrorBoundaryProps, LazyErrorBoundaryState> {
  declare props: Readonly<LazyErrorBoundaryProps>;
  declare setState: (state: Partial<LazyErrorBoundaryState>) => void;
  state: LazyErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): LazyErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown): void {
    console.warn('Lazy module load boundary caught error:', error);
  }

  private handleReload = (): void => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    } else {
      this.setState({ hasError: false });
      this.props.onReset?.();
    }
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[110] rounded-2xl bg-[#111318]/95 border border-white/10 px-4 py-3 text-xs text-neutral-200 shadow-2xl flex items-center gap-3 backdrop-blur-xl"
        >
          <span>화면을 불러오는 중 연결이 중단되었습니다.</span>
          <button
            type="button"
            onClick={this.handleReload}
            className="px-2.5 py-1 rounded-lg bg-white text-black font-semibold hover:bg-neutral-200 transition-colors cursor-pointer shrink-0"
          >
            새로고침
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
