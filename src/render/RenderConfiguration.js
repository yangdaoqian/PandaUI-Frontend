const number = (value, fallback, low, high) => {
  const parsed = value == null || value === '' ? fallback : Number(value)
  if (!Number.isFinite(parsed)) throw new Error('Render settings must contain finite numbers.')
  return Math.min(high, Math.max(low, parsed))
}
const vector = (value, fallback) => {
  if (value == null) return [...fallback]
  const array = Array.isArray(value) ? value : [value.x, value.y, value.z]
  if (array.length !== 3 || !array.every(item => Number.isFinite(Number(item)))) throw new Error('Expected a finite XYZ vector.')
  return array.map(Number)
}
const object = value => value != null && typeof value === 'object' && !Array.isArray(value)
function validateData (value, parents = new Set()) {
  if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Render data must contain finite numbers.')
  if (typeof value === 'function' || typeof value === 'bigint' || typeof value === 'symbol') throw new Error('Render data must be serializable.')
  if (value && typeof value === 'object') {
    if (parents.has(value)) throw new Error('Cyclic render configuration.')
    parents.add(value)
    Object.values(value).forEach(item => validateData(item, parents))
    parents.delete(value)
  }
}
export function renderConfigurationKey (value) {
  const sorted = item => Array.isArray(item) ? item.map(sorted) : object(item) ? Object.fromEntries(Object.keys(item).sort().map(key => [key, sorted(item[key])])) : item
  return JSON.stringify(sorted(value))
}
export function normalizeRenderConfiguration (descriptor) {
  if (descriptor == null) return null
  if (descriptor.kind !== 'render.config') throw new Error('Expected a Render Output configuration.')
  validateData(descriptor)
  for (const key of ['environment', 'quality', 'effects', 'camera']) if (descriptor[key] != null && !object(descriptor[key])) throw new Error(`Invalid render ${key}.`)
  for (const key of ['lights', 'bindings']) if (descriptor[key] != null && !Array.isArray(descriptor[key])) throw new Error(`Invalid render ${key}.`)
  for (const light of descriptor.lights || []) if (!object(light)) throw new Error('Invalid render light.')
  for (const binding of descriptor.bindings || []) if (!object(binding) || !Array.isArray(binding.targets) || !binding.targets.every(id => typeof id === 'string') || !object(binding.material)) throw new Error('Invalid material binding targets or material.')
  // Explicit schemas keep graph data serializable and renderer objects private.
  const data = JSON.parse(JSON.stringify(descriptor))
  if (!['raster', 'pathtrace'].includes(data.mode || 'raster')) throw new Error('Unknown render mode.')
  const quality = data.quality || {}, effects = data.effects || {}
  return {
    kind: 'render.config',
    enabled: data.enabled !== false,
    mode: data.mode || 'raster',
    environment: data.environment || { preset: 'studio', intensity: 1, background: true },
    lights: Array.isArray(data.lights) ? data.lights : [],
    bindings: Array.isArray(data.bindings) ? data.bindings : [],
    camera: data.camera ? {
      position: vector(data.camera.position, [10, -10, 10]),
      target: vector(data.camera.target, [0, 0, 0]),
      fov: number(data.camera.fov, 45, 1, 179),
      projection: data.camera.projection === 'orthographic' ? 'orthographic' : 'perspective',
      orthographicHeight: number(data.camera.orthographicHeight, 40, 0.00001, 1e12)
    } : null,
    quality: {
      resolutionScale: number(quality.resolutionScale, 1, 0.1, 2),
      interactionScale: number(quality.interactionScale, 0.6, 0.1, 1),
      samples: Math.round(number(quality.samples, 128, 1, 65536)),
      bounces: Math.round(number(quality.bounces, 4, 1, 16))
    },
    effects: {
      exposure: number(effects.exposure, 1, 0.01, 32),
      ao: number(effects.ao, 0, 0, 4),
      bloom: number(effects.bloom, 0, 0, 4),
      fxaa: effects.fxaa !== false,
      showEdges: effects.showEdges === true,
      showCurves: effects.showCurves !== false,
      shadows: effects.shadows !== false
    }
  }
}

// Last explicitly changed output controls this window. Repeated execution of
// unchanged nodes never steals ownership; removing it restores the previous one.
export class RenderConfigurationStore {
  entries = new Map()
  set (id, descriptor) {
    if (id == null) throw new Error('Render Output needs a node ID.')
    const key = String(id)
    if (!key || key === 'undefined') throw new Error('Render Output needs a node ID.')
    const config = normalizeRenderConfiguration(descriptor)
    if ((!config?.enabled && !this.entries.has(key)) || renderConfigurationKey(this.entries.get(key)) === renderConfigurationKey(config)) return false
    this.entries.delete(key)
    if (config?.enabled) this.entries.set(key, config)
    return true
  }
  get active () { return [...this.entries].pop() || null }
  clear () { this.entries.clear() }
}
