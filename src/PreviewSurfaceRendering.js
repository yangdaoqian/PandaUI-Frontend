export function renderPreviewSurfaceDepth (renderer, scene, camera, geometry, material, group) {
  if (!this.userData.nodePreview || scene.overrideMaterial || !material.transparent || material.opacity <= 0 || !material.depthTest) return
  const colorWrite = material.colorWrite
  const depthWrite = material.depthWrite
  this.modelViewMatrix.multiplyMatrices(camera.matrixWorldInverse, this.matrixWorld)
  this.normalMatrix.getNormalMatrix(this.modelViewMatrix)
  try {
    material.colorWrite = false
    material.depthWrite = true
    renderer.renderBufferDirect(camera, scene, geometry, material, this, group)
  } finally {
    material.colorWrite = colorWrite
    material.depthWrite = depthWrite
  }
}
