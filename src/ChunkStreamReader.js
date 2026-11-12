const EMPTY_BYTES = new Uint8Array(0)

export default class ChunkStreamReader {
  constructor (reader) {
    this.reader = reader
    this.pending = EMPTY_BYTES
  }

  async read (length) {
    if (!Number.isSafeInteger(length) || length < 0) throw new Error('Invalid display data length.')
    const data = new Uint8Array(length)
    let offset = 0
    while (offset < length) {
      if (this.pending.length === 0) {
        const result = await this.reader.read()
        if (result.done) throw new Error('Truncated display data.')
        this.pending = result.value
      }
      const count = Math.min(length - offset, this.pending.length)
      data.set(this.pending.subarray(0, count), offset)
      this.pending = count === this.pending.length ? EMPTY_BYTES : this.pending.subarray(count)
      offset += count
    }
    return data.buffer
  }

  async integer (bytes = 4) {
    const view = new DataView(await this.read(bytes))
    const value = view.getUint32(0, true) + (bytes === 8 ? view.getUint32(4, true) * 4294967296 : 0)
    if (!Number.isSafeInteger(value)) throw new Error('Invalid display data length.')
    return value
  }

  async finish () {
    if (this.pending.length !== 0 || !(await this.reader.read()).done) throw new Error('Unexpected trailing display data.')
  }

  async dispose () {
    const reader = this.reader
    this.reader = null
    this.pending = EMPTY_BYTES
    if (!reader) return
    try {
      await reader.cancel().catch(() => {})
    } finally {
      reader.releaseLock()
    }
  }
}
