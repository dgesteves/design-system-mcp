/**
 * Calls the loader worker (`worker.ts`) synchronously: posts the request, blocks on a shared
 * flag until the worker has answered, and takes the answer off the port. The worker is
 * started on first use and does not keep ESLint's process alive.
 */
import { MessageChannel, receiveMessageOnPort, Worker } from 'node:worker_threads';

import type { Call, LoadRequest, LoadResponse } from './worker.js';

/** Long enough for a cold extraction of a large design system. */
const TIMEOUT_MS = 120_000;

let worker: Worker | undefined;

function start(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./eslint-worker.js', import.meta.url));
  worker.unref();
  worker.on('error', () => {
    worker = undefined;
  });
  worker.on('exit', () => {
    worker = undefined;
  });
  return worker;
}

export function loadSync(request: LoadRequest): LoadResponse {
  const { port1, port2 } = new MessageChannel();
  const signal = new Int32Array(new SharedArrayBuffer(4));
  try {
    const call: Call = { request, signal, port: port2 };
    start().postMessage(call, [port2]);
    if (Atomics.wait(signal, 0, 0, TIMEOUT_MS) === 'timed-out') {
      return { error: `the design system did not load within ${TIMEOUT_MS / 1000} seconds` };
    }
    const message = receiveMessageOnPort(port1);
    return message ? (message.message as LoadResponse) : { error: 'the loader sent no answer' };
  } finally {
    port1.close();
  }
}
