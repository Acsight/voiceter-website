/**
 * Sleep utility
 */

/**
 * Sleep for a specified duration
 * @param ms - Milliseconds to sleep
 * @returns Promise that resolves after the delay
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Sleep with a timeout that can be cancelled
 * @param ms - Milliseconds to sleep
 * @param signal - AbortSignal to cancel the sleep
 * @returns Promise that resolves after the delay or rejects if cancelled
 */
export function sleepWithSignal(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Sleep cancelled'));
      return;
    }

    const timeout = setTimeout(resolve, ms);

    signal?.addEventListener('abort', () => {
      clearTimeout(timeout);
      reject(new Error('Sleep cancelled'));
    });
  });
}
