/**
 * Applies the latest desired value, one apply at a time. Calls during an apply are dropped, but the
 * apply loop re-reads the desired value when it settles, so the last toggle always wins.
 */
export function createReconciler<T>(read: () => T, apply: (value: T) => Promise<void>): () => Promise<void> {
  let running = false;
  return async () => {
    if (running) return;
    running = true;
    try {
      let value: T;
      do {
        value = read();
        await apply(value);
      } while (read() !== value);
    } finally {
      running = false;
    }
  };
}
