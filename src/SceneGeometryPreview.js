/* global WeakRef */

import * as THREE from 'three'
import { createPreviewMesh } from './RhinoGeometryConverter.js'
import { geometryReference, findGeometryResource, retainGeometry } from './DisplayResources'

const restoredGeometries = new WeakMap()

export function captureGeometry (object) {
  const geometry = object.geometry
  const attributes = {}
  for (const [name, attribute] of Object.entries(geometry.attributes)) {
    if (attribute.isInterleavedBufferAttribute) return null
    attributes[name] = { array: attribute.array, itemSize: attribute.itemSize, normalized: attribute.normalized }
  }
  object.updateWorldMatrix(true, false)
  return {
    resourceId: geometryReference(geometry),
    type: object.isMesh ? 'mesh' : object.isLineSegments ? 'lineSegments' : 'line',
    attributes,
    index: geometry.index?.array || null,
    groups: geometry.groups.map(group => ({ ...group })),
    drawRange: { ...(geometry.drawRange || { start: 0, count: geometry.index?.count ?? geometry.attributes.position?.count ?? 0 }) },
    matrix: object.matrixWorld.toArray()
  }
}

export function restoreGeometryPreview (snapshots, role, displayInfo = {}) {
  const root = new THREE.Group()
  for (const snapshot of snapshots || []) {
    const mesh = snapshot.type === 'mesh'
    if ((role === 'mesh' && !mesh) || (role === 'wire' && mesh)) continue
    let geometry = findGeometryResource(snapshot.resourceId) || restoredGeometries.get(snapshot)?.deref()
    if (!geometry || !findGeometryResource(geometry.uuid)) {
      geometry = new THREE.BufferGeometry()
      for (const [name, attribute] of Object.entries(snapshot.attributes)) {
        geometry.setAttribute(name, new THREE.BufferAttribute(attribute.array, attribute.itemSize, attribute.normalized))
      }
      if (snapshot.index) geometry.setIndex(new THREE.BufferAttribute(snapshot.index, 1))
      for (const group of snapshot.groups) geometry.addGroup(group.start, group.count, 0)
      geometry.setDrawRange(snapshot.drawRange.start, snapshot.drawRange.count)
      geometryReference(geometry)
      restoredGeometries.set(snapshot, new WeakRef(geometry))
    }
    const release = retainGeometry(geometry)
    if (geometry.uuid !== snapshot.resourceId) geometry.dispose()
    const opacity = displayInfo.opacity ?? 0.75
    const color = mesh ? displayInfo.color : (displayInfo.edgesColor ?? displayInfo.color)
    const options = { color: color ?? 0xff69b4, opacity, transparent: opacity < 1, depthWrite: opacity >= 1 }
    const object = mesh ? createPreviewMesh(geometry, options.color)
      : snapshot.type === 'lineSegments' ? new THREE.LineSegments(geometry, new THREE.LineBasicMaterial(options)) : new THREE.Line(geometry, new THREE.LineBasicMaterial(options))
    const materials = new Set([object.material, ...Object.values(object.userData.displayMaterials || {})])
    materials.forEach(material => { material.opacity = options.opacity; material.transparent = options.transparent; material.depthWrite = options.depthWrite })
    object.releaseGeometryResource = release
    object.matrixAutoUpdate = false
    object.matrix.fromArray(snapshot.matrix)
    object.matrix.decompose(object.position, object.quaternion, object.scale)
    object.userData.nodePreview = true
    object.userData.nonselectable = true
    object.raycast = () => {}
    object.userData.selectionRole = mesh ? 'surface' : 'edge'
    root.add(object)
  }
  return root.children.length ? root : null
}
