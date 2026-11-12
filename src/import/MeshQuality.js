export const DEFAULT_MESH_PRECISION = 0.6
export const DEFAULT_MESH_WORKER_COUNT = 8
export const MESH_QUALITY_OPTIONS = Object.freeze([
  { label: 'Minimal', value: 0 }, { label: 'Very coarse', value: 0.2 }, { label: 'Coarse', value: 0.4 },
  { label: 'Low', value: 0.6 }, { label: 'Medium', value: 0.8 }, { label: 'High', value: 1 }
])

export function normalizeMeshPrecision (value) {
  const number = Number(value)
  if (value == null || !Number.isFinite(number)) return DEFAULT_MESH_PRECISION
  return Math.min(5, Math.max(0, Math.round(number * 5))) / 5
}

export function loadMeshPrecision (value, version) {
  if (value == null || !Number.isFinite(Number(value))) return DEFAULT_MESH_PRECISION
  return Number(version) >= 4 ? normalizeMeshPrecision(value) : Number(value) < 0.25 ? 0.6 : Number(value) > 0.75 ? 1 : 0.8
}

export function meshQualityOptions (value) {
  const quality = normalizeMeshPrecision(value), index = Math.round(quality * 5)
  return {
    // Shared model-unit distance and angular errors, not a segment quota.
    tolerance: [0.5, 0.2, 0.1, 0.05, 0.01, 0.005][index],
    angleTolerance: [30, 22.5, 15, 11.25, 7.5, 5][index] * Math.PI / 180,
    // No per-Brep vertex quota. The Worker pool still applies bounded memory
    // backpressure, and the renderer owns the lifetime of accepted buffers.
    maxVertices: 0,
    maxTriangles: 0,
    maxDepth: quality === 1 ? 20 : 16
  }
}
