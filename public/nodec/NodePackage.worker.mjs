import { validateManifest, packageURL, fetchPackageFile, instantiatePackage } from './NodePackageProtocol.mjs'
const packages = new Map()
async function load (manifest, url) {
  validateManifest(manifest)
  url = packageURL(url, self.location.href)
  const signature = url + '\n' + JSON.stringify(manifest)
  if (packages.has(manifest.id)) {
    const existing = packages.get(manifest.id)
    if (existing.signature !== signature) throw new Error('Conflicting WASM package id: ' + manifest.id)
    return existing.promise
  }
  const promise = fetchPackageFile(url).then(bytes => instantiatePackage(bytes, manifest))
  packages.set(manifest.id, { signature, promise })
  try { return await promise } catch (error) { packages.delete(manifest.id); throw error }
}
self.onmessage = async ({ data }) => {
  const { requestId, operation, manifest, url, nodeIndex } = data
  try {
    if (!['load', 'solve'].includes(operation)) throw new Error('Unknown WASM package operation.')
    const api = await load(manifest, url)
    let result = { id: manifest.id, count: manifest.nodes.length, status: 'loaded' }
    if (operation === 'solve') {
      if (!Number.isInteger(nodeIndex) || nodeIndex < 0 || nodeIndex >= manifest.nodes.length) throw new Error('Invalid WASM node index.')
      const status = api.panda_solve(nodeIndex)
      if (status !== 1) throw new Error('Unexpected registration-only execution status: ' + status)
      result = { status: 'pending', message: manifest.nodes[nodeIndex].name + ': SolveInstance is not implemented yet (' + manifest.name + ').' }
    }
    self.postMessage({ requestId, result })
  } catch (error) { self.postMessage({ requestId, error: error.message || String(error) }) }
}
