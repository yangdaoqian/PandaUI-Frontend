import * as THREE from 'three'
import { BufferGeometryUtils } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { applyRenderMaterialSettings, applyShadingMaterialSettings } from '../DisplayMaterialSettings'
import { createRobotToolPreview, releaseRobotPreview } from './RobotToolPreview'

function normalizeKukaColor (value) {
  if (value == null || value === '') return null
  if (Array.isArray(value) && value.length >= 3) {
    const components = value.slice(0, 3).map(Number)
    if (!components.every(Number.isFinite)) return null
    const scale = components.some(component => Math.abs(component) > 1) ? 255 : 1
    return new THREE.Color(
      THREE.MathUtils.clamp(components[0] / scale, 0, 1),
      THREE.MathUtils.clamp(components[1] / scale, 0, 1),
      THREE.MathUtils.clamp(components[2] / scale, 0, 1)
    )
  }
  if (typeof value === 'string' && value.trim()) return new THREE.Color(value.trim())
  return null
}

export default class KukaPreview {
  #entries = new Map()
  #services

  constructor (services) {
    this.#services = { fetchAsset: (...args) => fetch(...args), createWorker: url => new Worker(url), ...services }
  }

  attachEntry (entry) {
    if (entry?.root == null) return false
    const pipeline = this.#services.getPipeline()
    if (entry.root.parent == null) pipeline.addPreviewObject(entry.root)
    return entry.root.parent != null
  }

  applyTransforms (entry, transforms) {
    if (entry == null || entry.groups == null) return 0
    const values = Array.isArray(transforms) ? transforms : []
    let applied = 0
    entry.groups.forEach((group, index) => {
      if (group == null) return
      const baseMatrix = entry.baseMatrices[index]
      const input = values[index]
      const matrix = new THREE.Matrix4()
      if (Array.isArray(input) && input.length === 16 && input.every(value => Number.isFinite(Number(value)))) {
        matrix.fromArray(input.map(Number))
      } else {
        matrix.identity()
      }
      group.matrix.copy(baseMatrix).multiply(matrix)
      group.matrixAutoUpdate = false
      group.matrixWorldNeedsUpdate = true
      group.updateMatrixWorld(true)
      applied++
    })
    if (entry.toolRoot) {
      const input = values[10]
      const matrix = entry.toolRoot.matrix
      if (Array.isArray(input) && input.length === 16 && input.every(value => Number.isFinite(Number(value)))) matrix.fromArray(input.map(Number))
      else matrix.identity()
      entry.toolRoot.matrixAutoUpdate = false
      entry.toolRoot.matrixWorldNeedsUpdate = true
    }
    entry.root?.updateMatrixWorld?.(true)
    return applied
  }

  updateTool (entry, references) {
    const key = JSON.stringify(references || [])
    if (entry.toolKey === key) return
    const pipeline = this.#services.getPipeline()
    const tool = createRobotToolPreview(pipeline, references)
    releaseRobotPreview(entry.toolRoot)
    entry.toolRoot = tool
    entry.toolKey = key
    if (tool) {
      entry.root.add(tool)
      const settings = this.#services.getSettings()
      pipeline.applyDisplaySettings?.(settings.shadingSettings, settings.renderSettings, settings.model1.displayMode === 'render')
    }
  }

  applyColors (entry, colors) {
    if (entry == null || entry.groups == null) return 0
    const values = Array.isArray(colors) ? colors : []
    let applied = 0
    entry.groups.forEach((group, index) => {
      if (group == null) return
      const override = normalizeKukaColor(values[index])
      group.traverse(object => {
        const displayMaterials = object.userData?.displayMaterials
        const materials = displayMaterials != null
          ? [displayMaterials.shading, displayMaterials.render]
          : [object.material]
        materials.flat().filter(Boolean).forEach(material => {
          if (material.userData.kukaOriginalColor == null) material.userData.kukaOriginalColor = material.color.clone()
          material.color.copy(override || material.userData.kukaOriginalColor)
          if (material.isMeshPhongMaterial) material.emissive.copy(material.color).multiplyScalar(0.045)
          material.needsUpdate = true
        })
      })
      applied++
    })
    return applied
  }

  createDefinitionGroup (data, overrideColor = null) {
    const group = new THREE.Group()
    group.name = String(data.name || 'Kuka Definition')
    group.userData.kukaPreview = true
    group.userData.kukaNonSelectable = true
    const materialGroups = new Map()
    ;(data.meshes || []).forEach(item => {
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.BufferAttribute(item.position, 3))
      if (item.normal != null && item.normal.length === item.position.length) geometry.setAttribute('normal', new THREE.BufferAttribute(item.normal, 3))
      else geometry.computeVertexNormals()
      if (item.index != null && item.index.length > 0) geometry.setIndex(new THREE.BufferAttribute(item.index, 1))
      const mergeGeometry = geometry.toNonIndexed()
      geometry.dispose()
      const materialKey = String(item.materialKey || `color:${(item.color || []).join(',')}`)
      if (!materialGroups.has(materialKey)) materialGroups.set(materialKey, { geometries: [], color: item.color })
      materialGroups.get(materialKey).geometries.push(mergeGeometry)
    })
    materialGroups.forEach((materialGroup, materialKey) => {
      const merged = materialGroup.geometries.length === 1 ? materialGroup.geometries[0] : BufferGeometryUtils.mergeBufferGeometries(materialGroup.geometries, true)
      materialGroup.geometries.forEach(geometry => { if (geometry !== merged) geometry.dispose() })
      if (merged == null) return
      const rgb = Array.isArray(materialGroup.color) && materialGroup.color.length === 3 ? materialGroup.color : [0.72, 0.72, 0.72]
      const originalColor = new THREE.Color(rgb[0], rgb[1], rgb[2])
      const materialColor = normalizeKukaColor(overrideColor) || originalColor
      const shadingMaterial = new THREE.MeshPhongMaterial({ color: materialColor, emissive: materialColor.clone().multiplyScalar(0.045), specular: 0x8a949c, shininess: 42, side: THREE.DoubleSide, toneMapped: false, transparent: false, opacity: 1, depthTest: true, depthWrite: true })
      const renderMaterial = new THREE.MeshPhysicalMaterial({ color: materialColor, metalness: 0.08, roughness: 0.52, clearcoat: 0.08, clearcoatRoughness: 0.3, side: THREE.DoubleSide, transparent: false, opacity: 1, depthTest: true, depthWrite: true })
      shadingMaterial.userData.kukaOriginalColor = originalColor.clone()
      renderMaterial.userData.kukaOriginalColor = originalColor.clone()
      applyShadingMaterialSettings(shadingMaterial, this.#services.getSettings().shadingSettings, this.#services.getPipeline()?.getShadingEnvironment())
      applyRenderMaterialSettings(renderMaterial, this.#services.getSettings().renderSettings, this.#services.getPipeline()?.getRenderEnvironment(), this.#services.getSettings().model1.displayMode === 'render')
      const displayMaterials = { shading: shadingMaterial, render: renderMaterial }
      const mesh = new THREE.Mesh(merged, this.#services.getSettings().model1.displayMode === 'render' ? renderMaterial : shadingMaterial)
      mesh.name = `${group.name} Mesh ${materialKey}`
      mesh.userData.kukaPreview = true
      mesh.userData.kukaNonSelectable = true
      mesh.userData.materialKey = materialKey
      mesh.userData.displayMaterials = displayMaterials
      group.add(mesh)
    })
    ;(data.edgeGroups || []).forEach(item => {
      if (item.position == null || item.position.length < 6) return
      const rgb = Array.isArray(item.color) && item.color.length === 3 ? item.color : [0.2, 0.2, 0.2]
      const originalColor = new THREE.Color(rgb[0], rgb[1], rgb[2])
      const edgeColor = normalizeKukaColor(overrideColor) || originalColor
      const edgeGeometry = new THREE.BufferGeometry()
      edgeGeometry.setAttribute('position', new THREE.BufferAttribute(item.position, 3))
      const edgeMaterial = new THREE.LineBasicMaterial({ color: edgeColor, linewidth: 1, transparent: false, opacity: 1, depthTest: true, depthWrite: true })
      edgeMaterial.userData.kukaOriginalColor = originalColor.clone()
      const edgeLines = new THREE.LineSegments(edgeGeometry, edgeMaterial)
      edgeLines.frustumCulled = false
      edgeLines.renderOrder = 1
      edgeLines.userData.edgeLines = true
      edgeLines.userData.sharpEdge = false
      edgeLines.userData.kukaPreview = true
      edgeLines.userData.kukaNonSelectable = true
      edgeLines.userData.materialKey = item.materialKey
      group.add(edgeLines)
    })
    return group
  }
  async set (nodeId, payload) {
    const key = String(nodeId || '')
    if (!key) throw new Error('Kuka node id is missing.')
    const names = Array.isArray(payload?.definitionNames) && payload.definitionNames.length > 0 ? payload.definitionNames.map(name => String(name)) : ['PIX_A0', 'PIX_A1', 'PIX_A2', 'PIX_A3', 'PIX_A4', 'PIX_A5', 'PIX_A6', 'PIX_A1G', 'PIX_A2G', 'PIX_A12G']
    let entry = this.#entries.get(key)
    const revision = Number(payload?.revision) || 0
    if (entry != null && revision > 0 && revision < (entry.latestRevision || 0)) return false
    const robotName = String(payload?.robotName || 'KR_120_210_R2700-2')
    const sourceUrl = String(payload?.assetUrl || `/editor/plugins/data/${encodeURIComponent(robotName)}.3dm`)
    if (entry != null && entry.sourceUrl !== sourceUrl) { this.clear(key); entry = null }
    if (entry == null) {
      entry = { nodeId: key, sourceUrl, loading: true, request: 0, latestRevision: revision, latestPayload: payload, root: new THREE.Group(), groups: [], baseMatrices: [] }
      entry.root.name = `${robotName} Preview`
      entry.root.userData.kukaPreview = true
      entry.root.userData.kukaNonSelectable = true
      entry.root.userData.nodePreview = true
      entry.root.userData.nonselectable = true
      entry.root.visible = this.#services.isVisible(key)
      this.#entries.set(key, entry)
      this.attachEntry(entry)
      entry.abort = new AbortController()
      const request = ++entry.request
      let worker = null
      try {
        this.updateTool(entry, payload?.tools)
        this.applyTransforms(entry, payload?.transforms)
        const response = await this.#services.fetchAsset(sourceUrl, { cache: 'no-store', signal: entry.abort.signal })
        if (!response.ok) throw new Error(`Kuka asset request failed (${response.status}).`)
        const buffer = await response.arrayBuffer()
        if (this.#entries.get(key) !== entry) return false
        worker = this.#services.createWorker('/editor/workers/kuka-rhino-worker.js')
        entry.worker = worker
        await new Promise((resolve, reject) => {
          entry.cancel = () => resolve()
          worker.onmessage = event => {
            const message = event.data || {}
            if (message.jobId !== request || this.#entries.get(key) !== entry) return
            if (message.type === 'definition') {
              const definitionGroup = this.createDefinitionGroup(message, entry.latestPayload?.colors?.[message.index])
              definitionGroup.userData.pandauiObjectId = `kuka-definition-${message.name}`
              entry.root.add(definitionGroup)
              entry.groups[message.index] = definitionGroup
              entry.baseMatrices[message.index] = definitionGroup.matrix.clone()
              this.applyTransforms(entry, entry.latestPayload?.transforms)
              this.#services.getPipeline()?.setDirtyFlag()
              if (!entry.hasAutoFramed) { entry.root.updateWorldMatrix(true, true); const bounds = new THREE.Box3().setFromObject(entry.root); if (!bounds.isEmpty()) { entry.hasAutoFramed = true; this.#services.getPipeline().zoomExtentsWithoutRhino(true, bounds) } }
            } else if (message.type === 'done') { entry.loading = false; worker.terminate(); entry.worker = null; resolve() } else if (message.type === 'error') reject(new Error(message.error || 'Rhino3dm worker failed.'))
          }
          worker.onerror = error => reject(error)
          worker.postMessage({ type: 'load', jobId: request, buffer, definitionNames: names }, [buffer])
        })
        if (this.#entries.get(key) !== entry || entry.request !== request) return false
      } catch (error) {
        worker?.terminate?.()
        const cancelled = this.#entries.get(key) !== entry
        if (this.#entries.get(key) === entry) { this.#entries.delete(key); entry.loading = false }
        if (!cancelled) entry.loadingReject?.(new Error(`Kuka preview failed: ${error.message || error}`))
        this.releaseEntry(entry)
        if (cancelled) return false
        throw new Error(`Kuka preview failed: ${error.message || error}`)
      }
    } else if (entry.loading) {
      this.updateTool(entry, payload?.tools)
      entry.latestRevision = revision
      entry.latestPayload = payload
      this.applyTransforms(entry, payload?.transforms)
      this.applyColors(entry, payload?.colors)
      this.#services.getPipeline()?.setDirtyFlag()
      entry.loadingResolve?.(false)
      return new Promise((resolve, reject) => { entry.loadingResolve = resolve; entry.loadingReject = reject })
    } else {
      this.updateTool(entry, payload?.tools)
      entry.latestRevision = revision; entry.latestPayload = payload; this.attachEntry(entry)
    }
    this.applyTransforms(entry, (entry.latestPayload || payload)?.transforms)
    this.applyColors(entry, (entry.latestPayload || payload)?.colors)
    this.updateDisplaySettings()
    this.#services.getPipeline()?.setDirtyFlag()
    this.#services.requestRender()
    entry.loadingResolve?.(true)
    entry.loadingResolve = null
    entry.loadingReject = null
    return true
  }
  clear (nodeId) {
    const key = String(nodeId || '')
    const entry = this.#entries.get(key)
    if (entry == null) return false
    entry.request++
    entry.abort?.abort()
    entry.cancel?.()
    entry.worker?.postMessage({ type: 'cancel' })
    entry.worker?.terminate?.()
    entry.worker = null
    this.#entries.delete(key)
    this.releaseEntry(entry)
    this.#services.getPipeline()?.setDirtyFlag()
    return true
  }

  clearAll () {
    Array.from(this.#entries.keys()).forEach(nodeId => this.clear(nodeId))
  }

  attach () { this.#entries.forEach(entry => this.attachEntry(entry)) }

  detach () { this.#entries.forEach(entry => entry.root?.parent?.remove(entry.root)) }

  setVisibility (id, visible) {
    const entry = this.#entries.get(String(id))
    if (entry) entry.root.visible = visible !== false
  }

  updateDisplaySettings () {
    const settings = this.#services.getSettings().model1
    this.#entries.forEach(entry => entry.root.traverse(object => {
      if (object.userData?.edgeLines) object.visible = settings.edgesVisible && (object.userData.sharpEdge === true || settings.nonSharpEdgesVisible)
    }))
  }

  releaseEntry (entry) {
    entry.loadingResolve?.(false)
    entry.loadingResolve = null
    entry.loadingReject = null
    releaseRobotPreview(entry.root)
    entry.toolRoot = null
    entry.toolKey = null
    entry.groups = []
    entry.baseMatrices = []
    entry.latestPayload = null
    entry.cancel = null
  }

  dispose () { this.clearAll() }
}
