// Hands solve records to the web worker that brings them into the stats file, see drive_worker.js.
let worker = null
let lastCall = 0
const calls = new Map() // id => {resolve, reject}

const settle = (id, outcome) => {
  const call = calls.get(id)
  calls.delete(id)
  call?.[outcome.error ? "reject" : "resolve"](outcome.error ? Object.assign(new Error(outcome.error.message), outcome.error) : outcome.result)
}

const startWorker = () => {
  const started = new Worker(new URL("./drive_worker.js", import.meta.url), {type: "module"})
  started.onmessage = ({data}) => settle(data.id, data)
  started.onerror = event => {
    // the worker itself failed: every call that waits for it fails, the next one starts a new worker
    started.terminate()
    worker = null
    for (const id of [...calls.keys()]) {
      settle(id, {error: {kind: "worker", message: event.message ?? "worker failed", status: 0}})
    }
  }
  return started
}

// Returns {sent, confirmed, total}. Throws an Error with a kind: those of DriveError (see drive_api.js),
// "file" (the stats file could not be read as one) or "worker".
export const pushRecords = (token, records) => new Promise((resolve, reject) => {
  worker ??= startWorker()
  const id = ++lastCall
  calls.set(id, {resolve, reject})
  worker.postMessage({id, token, records})
})
