import * as THREE from 'three'
import { moveDocumentItemVisibility } from './GeometryDocumentViewState'

const resourceOwners = new WeakMap()

function retain (resource, source, target) {
  if (!resource) return
  let owners = resourceOwners.get(resource)
  if (!owners) { owners = new Set([source]); resourceOwners.set(resource, owners) }
  owners.add(target)
  for (const document of [source, target]) {
    if (!document.transferredResources) document.transferredResources = new Set()
    document.transferredResources.add(resource)
  }
}

export function releaseDocumentResource (document, resource) {
  const owners = resourceOwners.get(resource)
  if (!owners) return true
  owners.delete(document)
  if (owners.size) return false
  resourceOwners.delete(resource)
  return true
}

export function removeDocumentDisplay (document, root) {
  document.invalidateRenderObject?.(root)
  const removed = new Set()
  const geometries = new Set()
  const materials = new Set()
  root.traverse(object => {
    document.disposableResources?.untrack?.(object)
    removed.add(object)
    if (object.geometry) geometries.add(object.geometry)
    ;[object.material, ...Object.values(object.userData.displayMaterials || {})].flat().filter(Boolean).forEach(material => materials.add(material))
  })
  root.parent?.remove(root)
  if (document.objects) document.objects = document.objects.filter(object => !removed.has(object))
  document.objectsByGeometryId?.forEach((object, id) => { if (removed.has(object)) document.objectsByGeometryId.delete(id) })
  document.stepHierarchyNodes?.forEach((object, id) => { if (removed.has(object)) document.stepHierarchyNodes.delete(id) })
  const retain = object => {
    geometries.delete(object.geometry)
    ;[object.material, ...Object.values(object.userData?.displayMaterials || {})].flat().filter(Boolean).forEach(material => materials.delete(material))
  }
  document.three.middleground.traverse(retain)
  document.three.foreground?.traverse(retain)
  document.sharedInstanceGeometries?.forEach(entry => geometries.delete(entry.geometry))
  document.displayMaterialPool?.forEach(material => materials.delete(material))
  document.renderMaterialLibrary?.forEach(entry => materials.delete(entry.material))
  geometries.forEach(geometry => {
    document.disposableResources?.delete?.(geometry)
    document.ownedGeometries?.delete(geometry)
    document.transferredResources?.delete(geometry)
    if (releaseDocumentResource(document, geometry)) geometry.dispose()
  })
  materials.forEach(material => {
    document.disposableResources?.delete?.(material)
    document.transferredResources?.delete(material)
    if (releaseDocumentResource(document, material)) material.dispose()
  })
  const vertices = [...removed].reduce((total, object) => total + (object.geometry?.getAttribute('position')?.count || 0), 0)
  if (Number.isFinite(document.sceneVertices)) document.sceneVertices = Math.max(0, document.sceneVertices - vertices)
}

export function moveDocumentDisplay (source, target, move) {
  if (!source || !target) return
  const movedIds = new Set(move.objects.map(item => item.geometryId))
  const moving = source.objects.filter(object => movedIds.has(object.userData.geometryId))
  if (source !== target) {
    source.objects = source.objects.filter(object => !movedIds.has(object.userData.geometryId))
    target.objects.push(...moving)
  }
  for (const reference of move.objects) {
    const root = source.objectsByGeometryId.get(reference.geometryId)
    if (!root) continue
    const previousReference = { ...root.userData }
    if (source !== target) {
      root.updateWorldMatrix(true, false)
      const world = root.matrixWorld.clone()
      target.three.middleground.updateWorldMatrix(true, false)
      target.three.middleground.add(root)
      new THREE.Matrix4().getInverse(target.three.middleground.matrixWorld).multiply(world).decompose(root.position, root.quaternion, root.scale)
      root.updateMatrixWorld(true)
      source.objectsByGeometryId.delete(reference.geometryId)
      target.objectsByGeometryId.set(reference.geometryId, root)
    }
    const keepMaterial = material => {
      if (!material || source === target) return
      retain(material, source, target)
      Object.values(material).forEach(value => { if (value?.isTexture) retain(value, source, target) })
    }
    root.traverse(object => {
      if (object.userData.documentId === move.sourceDocumentId || object.userData.geometryId === reference.geometryId || object === root) {
        Object.assign(object.userData, { documentId: move.targetDocumentId, revision: reference.revision, poolGeneration: move.poolGeneration })
        object.fullLayerPath = reference.layerPath
      }
      if (source !== target) {
        retain(object.geometry, source, target)
        if (object.geometry) target.ownedGeometries.add(object.geometry)
        ;(Array.isArray(object.material) ? object.material : [object.material]).forEach(keepMaterial)
        Object.values(object.userData.displayMaterials || {}).flat().forEach(keepMaterial)
        if (object.onBrepDisplayChanged) {
          object.onBrepDisplayChanged = (changed, original) => {
            target.ownedGeometries.add(changed.geometry)
            target.ownedGeometries.add(original.geometry)
            target.objects.push(changed)
          }
        }
      }
    })
    moveDocumentItemVisibility(previousReference, root.userData)
  }
  if (source !== target) {
    const vertices = moving.reduce((count, object) => count + (object.geometry?.getAttribute('position')?.count || 0), 0)
    source.sceneVertices = Math.max(0, source.sceneVertices - vertices)
    target.sceneVertices += vertices
  }
  source.setDocumentLayers(move.source.layers || [])
  target.setDocumentLayers(move.target.layers || [])
}
