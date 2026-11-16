export type ScheduledTask<T> = (signal: AbortSignal) => Promise<T>;

export class PreviewScheduler<T> {
  private debounceMs: number;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private currentController: AbortController | null = null;
  private runningPromise: Promise<void> | null = null;
  private pendingTask: {
    fn: ScheduledTask<T>;
    resolve: (val: T | null) => void;
    reject: (err: unknown) => void;
  } | null = null;

  constructor(debounceMs = 300) {
    this.debounceMs = debounceMs;
  }

  schedule(fn: ScheduledTask<T>, immediate = false): Promise<T | null> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    // Cancel any previously queued task that hasn't started yet
    if (this.pendingTask) {
      this.pendingTask.resolve(null);
      this.pendingTask = null;
    }

    // Abort any currently running task so it finishes/discards as soon as possible
    if (this.currentController) {
      this.currentController.abort();
    }

    return new Promise<T | null>((resolve, reject) => {
      this.pendingTask = { fn, resolve, reject };
      if (immediate || this.debounceMs <= 0) {
        this.flush();
      } else {
        this.timer = setTimeout(() => {
          this.timer = null;
          this.flush();
        }, this.debounceMs);
      }
    });
  }

  async waitForIdle(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
      this.flush();
    }
    while (this.runningPromise || this.pendingTask) {
      if (this.runningPromise) {
        await this.runningPromise;
      }
    }
  }

  private flush(): void {
    if (this.runningPromise) {
      // The running promise loop will pick up `this.pendingTask` once the active run exits
      return;
    }
    this.runningPromise = this.runLoop().finally(() => {
      this.runningPromise = null;
    });
  }

  private async runLoop(): Promise<void> {
    while (this.pendingTask) {
      const task = this.pendingTask;
      this.pendingTask = null;
      const controller = new AbortController();
      this.currentController = controller;
      try {
        const res = await task.fn(controller.signal);
        if (controller.signal.aborted) {
          task.resolve(null);
        } else {
          task.resolve(res);
        }
      } catch (err) {
        if (controller.signal.aborted) {
          task.resolve(null);
        } else {
          task.reject(err);
        }
      } finally {
        if (this.currentController === controller) {
          this.currentController = null;
        }
      }
    }
  }
}
