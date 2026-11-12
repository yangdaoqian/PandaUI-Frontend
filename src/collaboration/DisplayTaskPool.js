// Bound both requests and decoded objects waiting to enter the scene. Yield by
// elapsed work, not once per object/rendered frame (slow views can take 200ms).
export async function runDisplayTasks (items, visit, { concurrency = 4, signal } = {}) {
  let cursor = 0, yieldedAt = performance.now(), yielding
  const worker = async () => {
    while (!signal?.aborted && cursor < items.length) {
      if (yielding || performance.now() - yieldedAt >= 8) {
        yielding ||= new Promise(resolve => setTimeout(resolve, 0)).then(() => { yieldedAt = performance.now(); yielding = null })
        await yielding
      }
      if (signal?.aborted || cursor >= items.length) return
      await visit(items[cursor++])
    }
  }
  const results = await Promise.allSettled(Array.from({ length: Math.min(items.length, Math.max(1, concurrency)) }, worker))
  const failed = results.find(result => result.status === 'rejected')
  if (failed) throw failed.reason
}
