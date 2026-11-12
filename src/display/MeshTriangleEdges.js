import * as THREE from 'three'

// Generate only when requested. Instances share the index buffer, and line
// positions reuse the render mesh's positions instead of expanding every edge.
export default class MeshTriangleEdges {
  geometries = new WeakMap()
  material = null

  ensure (mesh, resources) {
    if (!mesh.isMesh || !mesh.geometry?.attributes?.position) return
    const existing = mesh.children.find(child => child.userData.meshFaceEdges)
    if (existing) return existing
    const source = mesh.geometry
    let geometry = this.geometries.get(source)
    if (!geometry) {
      const position = source.attributes.position, index = source.index
      const start = Math.max(0, source.drawRange.start)
      const end = Math.min(index?.count ?? position.count, start + source.drawRange.count)
      const count = Math.floor((end - start) / 3)
      if (count < 1) return
      const indices = new Uint32Array(count * 6)
      for (let triangle = 0; triangle < count; triangle++) {
        const i = start + triangle * 3
        const a = index ? index.getX(i) : i, b = index ? index.getX(i + 1) : i + 1, c = index ? index.getX(i + 2) : i + 2
        const offset = triangle * 6
        indices[offset] = a; indices[offset + 1] = b
        indices[offset + 2] = b; indices[offset + 3] = c
        indices[offset + 4] = c; indices[offset + 5] = a
      }
      geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', position)
      geometry.setIndex(new THREE.BufferAttribute(indices, 1))
      this.geometries.set(source, geometry)
      geometry.addEventListener('dispose', () => this.geometries.delete(source))
      resources.push(geometry)
    }
    if (!this.material) {
      this.material = new THREE.LineBasicMaterial({ color: 0x263238, toneMapped: false, depthTest: true, depthWrite: false })
      // A small depth bias keeps coplanar lines visible without showing them
      // through foreground objects.
      this.material.onBeforeCompile = shader => {
        shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\ngl_Position.z -= 0.00001 * gl_Position.w;')
      }
      resources.push(this.material)
    }
    const lines = new THREE.LineSegments(geometry, this.material)
    lines.name = 'Mesh triangle edges'
    lines.userData.meshFaceEdges = true
    lines.renderOrder = 21
    lines.raycast = () => {}
    mesh.add(lines)
    return lines
  }
}
