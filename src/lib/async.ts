/** Bound reads without retrying a mutation that may already have committed. */
export function withTimeout<T>(promise: Promise<T>, timeoutMs = 15_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Request timed out")), timeoutMs);
    promise.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}
