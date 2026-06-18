// Copies the pdf.js worker and its static assets (cmaps, fonts, wasm, ICC
// profiles) from the installed pdfjs-dist package into public/pdfjs so the
// app serves everything same-origin (a real Worker requires same-origin) and
// the version always matches the bundled library.
//
// The worker file gets the same Safari compatibility polyfills the page uses
// (ReadableStream async iteration, Promise.withResolvers) prepended, since
// polyfills applied on the main thread don't reach the worker scope.
//
// Runs automatically via predev/prebuild.

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const pkgDir = path.dirname(require.resolve("pdfjs-dist/package.json"));
const version = JSON.parse(
  fs.readFileSync(path.join(pkgDir, "package.json"), "utf8"),
).version;

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, "..", "public", "pdfjs");

const WORKER_POLYFILLS = `/* Safari compatibility polyfills injected at build time (pdfjs-dist@${version}) */
(function () {
  if (typeof Promise.withResolvers !== "function") {
    Promise.withResolvers = function () {
      var resolve, reject;
      var promise = new Promise(function (res, rej) { resolve = res; reject = rej; });
      return { promise: promise, resolve: resolve, reject: reject };
    };
  }
  if (typeof ReadableStream !== "undefined" && typeof ReadableStream.prototype[Symbol.asyncIterator] !== "function") {
    var values = function (options) {
      var reader = this.getReader();
      var preventCancel = !!(options && options.preventCancel);
      var iterator = {
        next: function () {
          return reader.read().then(
            function (r) { if (r.done) reader.releaseLock(); return { done: !!r.done, value: r.value }; },
            function (err) { reader.releaseLock(); throw err; }
          );
        },
        return: function (value) {
          var cancel = preventCancel ? Promise.resolve() : reader.cancel(value).catch(function () {});
          return cancel.then(function () { reader.releaseLock(); return { done: true, value: value }; });
        },
      };
      iterator[Symbol.asyncIterator] = function () { return iterator; };
      return iterator;
    };
    if (typeof ReadableStream.prototype.values !== "function") ReadableStream.prototype.values = values;
    ReadableStream.prototype[Symbol.asyncIterator] = ReadableStream.prototype.values;
  }
})();
`;

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const workerSource = fs.readFileSync(
  path.join(pkgDir, "legacy", "build", "pdf.worker.min.mjs"),
  "utf8",
);
fs.writeFileSync(
  path.join(outDir, "pdf.worker.min.mjs"),
  WORKER_POLYFILLS + "\n" + workerSource,
);

for (const dir of ["cmaps", "standard_fonts", "wasm", "iccs"]) {
  const src = path.join(pkgDir, dir);
  if (fs.existsSync(src)) {
    fs.cpSync(src, path.join(outDir, dir), { recursive: true });
  }
}

fs.writeFileSync(path.join(outDir, "VERSION"), version + "\n");
console.log(`[pdf-translator] pdf.js ${version} assets copied to public/pdfjs`);
