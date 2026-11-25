export function createGlobalsWriteQueue() {
  let pending: Promise<unknown> = Promise.resolve()
  return function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = pending.then(operation, operation)
    pending = result.catch(() => undefined)
    return result
  }
}

export async function publishAfterGlobals(publishGlobals: () => Promise<boolean>, publishDocument: () => Promise<unknown>): Promise<boolean> {
  if (!await publishGlobals()) return false
  await publishDocument()
  return true
}
