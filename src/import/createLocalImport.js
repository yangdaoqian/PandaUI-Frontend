import LocalImportClient from './LocalImportClient'
import ImportMeshFeed from './ImportMeshFeed'
import SceneImportClient from './SceneImportClient'
import { SCENE_EXTENSIONS } from './ModelFileFormats'

export function createImportMeshFeed (header) {
  return new ImportMeshFeed(header, () => new Worker(new URL('./BrepMesh.worker.js', import.meta.url)), {
    hardwareConcurrency: navigator.hardwareConcurrency, deviceMemory: navigator.deviceMemory
  })
}

export default function createLocalImport (file) {
  if (SCENE_EXTENSIONS.includes(file?.name?.split('.').pop().toLowerCase())) return new SceneImportClient()
  return new LocalImportClient(new Worker(new URL('./LocalImport.worker.js', import.meta.url)), {
    completionOrder: true,
    createMesher: () => new Worker(new URL('./BrepMesh.worker.js', import.meta.url)),
    hardware: { hardwareConcurrency: navigator.hardwareConcurrency, deviceMemory: navigator.deviceMemory }
  })
}
