export type SyncQueueJobOptions = {
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

function backoffDelay(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
  const exp = Math.min(attempt, 8);
  const raw = baseDelayMs * Math.pow(2, exp);
  const jitter = Math.floor(raw * 0.2 * Math.random());
  return Math.min(maxDelayMs, raw + jitter);
}

function isRetryableError(error: unknown): boolean {
  const text = String((error as any)?.message || "").toLowerCase();
  if (!text) return true;
  if (text.includes("timeout")) return true;
  if (text.includes("network")) return true;
  if (text.includes("429")) return true;
  if (text.includes("rate")) return true;
  if (text.includes("500") || text.includes("502") || text.includes("503") || text.includes("504")) return true;
  return false;
}

export async function runWithRetry<T>(
  task: () => Promise<T>,
  options?: SyncQueueJobOptions
): Promise<T> {
  const attempts = Math.max(1, Math.floor(options?.attempts || 4));
  const baseDelayMs = Math.max(100, Math.floor(options?.baseDelayMs || 600));
  const maxDelayMs = Math.max(baseDelayMs, Math.floor(options?.maxDelayMs || 10000));

  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (attempt >= attempts - 1 || !isRetryableError(error)) break;
      await sleep(backoffDelay(attempt, baseDelayMs, maxDelayMs));
    }
  }
  throw lastError;
}

class SyncQueue {
  private tail: Promise<unknown> = Promise.resolve();

  enqueue<T>(job: () => Promise<T>, options?: SyncQueueJobOptions): Promise<T> {
    const runner = () => runWithRetry(job, options);
    const next = this.tail.then(runner, runner);
    this.tail = next.catch(() => undefined);
    return next;
  }
}

export const syncQueue = new SyncQueue();
