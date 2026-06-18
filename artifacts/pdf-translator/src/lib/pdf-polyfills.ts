// Polyfills required by pdf.js on older WebKit/Safari (and Node < 22).
//
// - Promise.withResolvers: missing before Safari 17.4.
// - ReadableStream async iteration (Symbol.asyncIterator / values): missing
//   before Safari 18.4. pdf.js iterates its text-content stream with
//   `for await (const value of readableStream)`, which on iOS throws
//   "undefined is not a function (near '...t of e...')".
//
// Import this module before loading pdf.js.

/* eslint-disable @typescript-eslint/no-explicit-any */

if (typeof (Promise as any).withResolvers !== "function") {
  (Promise as any).withResolvers = function withResolvers<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

if (typeof ReadableStream !== "undefined") {
  const proto = ReadableStream.prototype as any;
  if (typeof proto[Symbol.asyncIterator] !== "function") {
    const values = function values(
      this: ReadableStream,
      options?: { preventCancel?: boolean },
    ) {
      const reader = (this as any).getReader();
      const preventCancel = options?.preventCancel === true;
      const iterator = {
        next(): Promise<IteratorResult<unknown>> {
          return reader.read().then(
            (r: { done: boolean; value: unknown }) => {
              if (r.done) reader.releaseLock();
              return { done: !!r.done, value: r.value };
            },
            (err: unknown) => {
              reader.releaseLock();
              throw err;
            },
          );
        },
        return(value?: unknown): Promise<IteratorResult<unknown>> {
          const cancel = preventCancel
            ? Promise.resolve()
            : reader.cancel(value).catch(() => undefined);
          return cancel.then(() => {
            reader.releaseLock();
            return { done: true as const, value };
          });
        },
        [Symbol.asyncIterator]() {
          return iterator;
        },
      };
      return iterator;
    };
    if (typeof proto.values !== "function") proto.values = values;
    proto[Symbol.asyncIterator] = proto.values;
  }
}

export {};
