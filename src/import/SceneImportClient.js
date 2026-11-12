const cancelled = () => Object.assign(new Error('Import cancelled.'), { name: 'AbortError' })

// Same consumer/backpressure contract as LocalImportClient. DOM-based scene
// loaders are lazy-loaded; numeric point/mesh parsers use their own Worker.
export default class SceneImportClient {
  controller = new AbortController()
  get signal () { return this.controller.signal }
  dispose () { this.controller.abort() }

  async run (file, { onHeader, onRecord, onProgress, files = [] }) {
    let packet
    const check = () => { if (this.signal.aborted) throw cancelled() }
    try {
      const { openSceneFile } = await import('./SceneFileImport')
      check()
      packet = await openSceneFile(file, { files,
        signal: this.signal,
        onProgress: state => onProgress?.({
          phase: state.phase === 'reading' ? 'Reading scene file' : 'Parsing scene file',
          readBytes: state.phase === 'reading' ? state.loaded : file.size,
          sourceBytes: file.size
        }) })
      check()
      const { records, ...metadata } = packet
      await onHeader(null, metadata)
      const totalObjects = records.length
      let start = performance.now()
      for (let index = 0; index < totalObjects; index++) {
        check()
        await onRecord(records[index])
        records[index] = null
        if (performance.now() - start >= 8 || index + 1 === totalObjects) {
          onProgress?.({ phase: 'Adding scene objects', processedObjects: index + 1, totalObjects, readBytes: file.size, sourceBytes: file.size })
          await new Promise(resolve => setTimeout(resolve, 0))
          start = performance.now()
        }
      }
      check()
      onProgress?.({ phase: 'Complete', done: true, processedObjects: totalObjects, totalObjects })
    } finally { if (packet) packet.records.length = 0; this.dispose() }
  }
}
