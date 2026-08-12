import { AsyncLocalStorage } from "node:async_hooks";

const requestSignalStorage = new AsyncLocalStorage<AbortSignal>();

export function runWithRequestSignal<T>(
  signal: AbortSignal | undefined,
  operation: () => T,
): T {
  return signal ? requestSignalStorage.run(signal, operation) : operation();
}

export function currentRequestSignal(): AbortSignal | undefined {
  return requestSignalStorage.getStore();
}
