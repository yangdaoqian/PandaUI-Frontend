import * as THREE from 'three'

const shadowGroundName = 'Render shadow ground'

function collectMeshes (objects) {
  const meshes = []
  objects.forEach(object => {
    object.traverse(item => {
      if (item.isMesh && !item.userData.renderShadowGround) meshes.push(item)
    })
  })
  return meshes
}

export function configureRenderShadows (lighting, objects) {
  const meshes = collectMeshes(objects)
  const bounds = new THREE.Box3()
  const objectBounds = new THREE.Box3()
  meshes.forEach(mesh => {
    if (mesh.geometry?.boundingBox == null) mesh.geometry?.computeBoundingBox()
    if (mesh.geometry?.boundingBox == null) return
    mesh.updateWorldMatrix(true, false)
    objectBounds.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld)
    bounds.union(objectBounds)
    mesh.castShadow = true
    mesh.receiveShadow = true
  })

  const ground = lighting.render.getObjectByName(shadowGroundName)
  const key = lighting.render.getObjectByName('Render key light')
  if (bounds.isEmpty() || key == null) {
    if (ground != null) ground.visible = false
    return
  }

  const size = bounds.getSize(new THREE.Vector3())
  const center = bounds.getCenter(new THREE.Vector3())
  const radius = Math.max(size.x, size.y, size.z, 0.01) * 0.5
  const floorSize = Math.max(radius * 6, 1)
  const floorOffset = Math.max(radius * 0.002, 0.0001)

  let shadowGround = ground
  if (shadowGround == null) {
    shadowGround = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.ShadowMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false })
    )
    shadowGround.name = shadowGroundName
    shadowGround.userData.renderShadowGround = true
    shadowGround.receiveShadow = true
    lighting.render.add(shadowGround)
  }
  shadowGround.position.set(center.x, center.y, bounds.min.z - floorOffset)
  shadowGround.scale.set(floorSize, floorSize, 1)
  shadowGround.visible = true

  key.castShadow = true
  key.position.copy(center).add(new THREE.Vector3(radius * 1.2, -radius * 1.5, radius * 2))
  key.target.position.copy(center)
  key.shadow.mapSize.set(1024, 1024)
  key.shadow.camera.left = -radius * 1.8
  key.shadow.camera.right = radius * 1.8
  key.shadow.camera.top = radius * 1.8
  key.shadow.camera.bottom = -radius * 1.8
  key.shadow.camera.near = Math.max(radius * 0.01, 0.001)
  key.shadow.camera.far = radius * 6
  key.shadow.bias = -0.0001
  key.shadow.camera.updateProjectionMatrix()
  key.target.updateMatrixWorld()
}

export function disposeRenderShadows (lighting) {
  const ground = lighting?.render?.getObjectByName(shadowGroundName)
  if (ground == null) return
  lighting.render.remove(ground)
  ground.geometry.dispose()
  ground.material.dispose()
}
