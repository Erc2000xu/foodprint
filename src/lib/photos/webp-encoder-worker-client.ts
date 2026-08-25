export type WebpWorkerMessage =
  | { id: number; ok: true; data: ArrayBuffer }
  | { id: number; ok: false; error: string };

export type WebpWorkerLike = {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  addEventListener(type: "message", listener: (event: MessageEvent<WebpWorkerMessage>) => void): void;
  addEventListener(type: "error", listener: (event: ErrorEvent) => void): void;
  removeEventListener(type: "message", listener: (event: MessageEvent<WebpWorkerMessage>) => void): void;
  removeEventListener(type: "error", listener: (event: ErrorEvent) => void): void;
  terminate(): void;
};

export type WebpWorkerFactory = () => WebpWorkerLike;

export class WebpWorkerError extends Error {
  readonly timedOut: boolean;

  constructor(message: string, options: { timedOut?: boolean } = {}) {
    super(message);
    this.name = "WebpWorkerError";
    this.timedOut = options.timedOut ?? false;
  }
}

function createDefaultWorker() {
  return new Worker("/workers/webp-encoder.worker.js", { type: "module" }) as unknown as WebpWorkerLike;
}

type PendingRequest = {
  resolve: (data: ArrayBuffer) => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
  abort?: () => void;
};

const workerTimeoutMs = 15_000;

/** One bounded, disposable worker client. It is only constructed after native encoding fails. */
export class WebpWorkerEncoder {
  private readonly worker: WebpWorkerLike;
  private readonly pending = new Map<number, PendingRequest>();
  private nextId = 0;
  private disposed = false;

  constructor(factory: WebpWorkerFactory = createDefaultWorker) {
    this.worker = factory();
    this.worker.addEventListener("message", this.onMessage);
    this.worker.addEventListener("error", this.onError);
  }

  encode(imageData: ImageData, quality: number, signal?: AbortSignal) {
    if (this.disposed) return Promise.reject(new WebpWorkerError("worker_disposed"));
    if (signal?.aborted) return Promise.reject(new WebpWorkerError("worker_aborted"));
    const id = ++this.nextId;
    const data = imageData.data.slice().buffer;
    return new Promise<ArrayBuffer>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.rejectRequest(id, new WebpWorkerError("worker_timeout", { timedOut: true }));
        this.dispose();
      }, workerTimeoutMs);
      const pending: PendingRequest = { resolve, reject, timeoutId };
      if (signal) {
        const abort = () => {
          this.rejectRequest(id, new WebpWorkerError("worker_aborted"));
          this.dispose();
        };
        signal.addEventListener("abort", abort, { once: true });
        pending.abort = () => signal.removeEventListener("abort", abort);
      }
      this.pending.set(id, pending);
      try {
        this.worker.postMessage({ type: "encode", id, data, width: imageData.width, height: imageData.height, quality: Math.round(Math.max(1, Math.min(100, quality * 100))) }, [data]);
      } catch (error) {
        this.rejectRequest(id, error instanceof Error ? error : new WebpWorkerError("worker_post_failed"));
      }
    });
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.worker.removeEventListener("message", this.onMessage);
    this.worker.removeEventListener("error", this.onError);
    this.worker.terminate();
    for (const [id, request] of this.pending) {
      clearTimeout(request.timeoutId);
      request.abort?.();
      request.reject(new WebpWorkerError("worker_disposed"));
      this.pending.delete(id);
    }
  }

  private readonly onMessage = (event: MessageEvent<WebpWorkerMessage>) => {
    const response = event.data;
    const request = this.pending.get(response.id);
    if (!request) return;
    this.pending.delete(response.id);
    clearTimeout(request.timeoutId);
    request.abort?.();
    if (response.ok) request.resolve(response.data);
    else request.reject(new WebpWorkerError(response.error));
  };

  private readonly onError = () => {
    const error = new WebpWorkerError("worker_error");
    for (const id of [...this.pending.keys()]) this.rejectRequest(id, error);
    this.dispose();
  };

  private rejectRequest(id: number, error: Error) {
    const request = this.pending.get(id);
    if (!request) return;
    this.pending.delete(id);
    clearTimeout(request.timeoutId);
    request.abort?.();
    request.reject(error);
  }
}

export { createDefaultWorker as createWebpWorker };
