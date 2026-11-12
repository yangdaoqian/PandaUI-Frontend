import * as THREE from 'three'
import { PCDLoader } from 'three/examples/jsm/loaders/PCDLoader'
import { VTKLoader } from 'three/examples/jsm/loaders/VTKLoader'
import { checkSceneFileAbort, disposeSceneFileObject, sceneFileRecords } from './SceneFileRecords'

export const SCENE_FILE_WORKER_FORMATS = ['pcd', 'vtk', 'xyz', 'off']

const textOf = buffer => new TextDecoder().decode(buffer)
const contentLines = text => text.split(/\r?\n/).map(line => line.replace(/#.*/, '').trim()).filter(Boolean)

function parseXYZ (text) {
  const lines = contentLines(text), positions = new Float32Array(lines.length * 3)
  let colors, byteColors = false
  lines.forEach((line, index) => {
    const values = line.split(/[\s,;]+/).map(Number)
    if (![3, 6].includes(values.length) || !values.every(Number.isFinite)) throw new Error(`Invalid XYZ row ${index + 1}; expected x y z or x y z r g b.`)
    if (index === 0 && values.length === 6) colors = new Float32Array(lines.length * 3)
    if (!!colors !== (values.length === 6)) throw new Error('XYZ rows must all use the same number of columns.')
    positions.set(values.slice(0, 3), index * 3)
    if (colors) {
      if (values.slice(3).some(value => value < 0 || value > 255)) throw new Error('XYZ colors must be in the range 0..1 or 0..255.')
      if (values.slice(3).some(value => value > 1)) byteColors = true
      colors.set(values.slice(3), index * 3)
    }
  })
  if (byteColors) for (let i = 0; i < colors.length; i++) colors[i] /= 255
  const geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(positions, 3))
  if (colors) geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return new THREE.Points(geometry, new THREE.PointsMaterial({ color: colors ? 0xffffff : 0xcccccc, vertexColors: !!colors }))
}

function parseOFF (text, warnings) {
  const lines = contentLines(text), header = (lines.shift() || '').split(/\s+/)
  if (!['OFF', 'COFF', 'NOFF'].includes(header[0])) throw new Error('Only ASCII OFF, COFF, and NOFF are supported.')
  const counts = (header.length > 1 ? header.slice(1).join(' ') : lines.shift() || '').split(/\s+/).map(Number)
  const [vertices, faces] = counts
  if (counts.length !== 3 || !counts.every(value => Number.isInteger(value) && value >= 0) || vertices + faces > lines.length) throw new Error('Invalid or truncated OFF counts.')
  const positions = new Float32Array(vertices * 3)
  const colors = header[0] === 'COFF' ? new Float32Array(vertices * 3) : null
  const normals = header[0] === 'NOFF' ? new Float32Array(vertices * 3) : null
  let byteColors = false
  for (let i = 0; i < vertices; i++) {
    const values = lines[i].split(/\s+/).map(Number)
    if (values.length < ((colors || normals) ? 6 : 3) || !values.every(Number.isFinite)) throw new Error(`Invalid OFF vertex ${i}.`)
    positions.set(values.slice(0, 3), i * 3)
    if (normals) normals.set(values.slice(3, 6), i * 3)
    if (colors) {
      const rgb = values.slice(3, 6)
      if (rgb.some(value => value < 0 || value > 255)) throw new Error('Invalid OFF vertex color.')
      if (rgb.some(value => value > 1)) byteColors = true
      colors.set(rgb, i * 3)
      if (values.length > 6 && !warnings.includes('OFF vertex alpha is omitted.')) warnings.push('OFF vertex alpha is omitted.')
    }
  }
  if (byteColors) for (let i = 0; i < colors.length; i++) colors[i] /= 255
  const triangles = []
  for (let i = 0; i < faces; i++) {
    const values = lines[vertices + i].split(/\s+/).map(Number), count = values[0], polygon = values.slice(1, count + 1)
    if (!Number.isInteger(count) || count < 3 || polygon.length !== count || polygon.some(index => !Number.isInteger(index) || index < 0 || index >= vertices)) throw new Error(`Invalid OFF face ${i}.`)
    if (values.length > count + 1 && !warnings.includes('OFF per-face colors are omitted.')) warnings.push('OFF per-face colors are omitted.')
    // Project along the dominant Newell normal before ear clipping, so concave
    // polygons are triangulated rather than incorrectly rendered as a fan.
    const normal = new THREE.Vector3()
    for (let j = 0; j < count; j++) {
      const a = polygon[j] * 3, b = polygon[(j + 1) % count] * 3
      normal.x += (positions[a + 1] - positions[b + 1]) * (positions[a + 2] + positions[b + 2])
      normal.y += (positions[a + 2] - positions[b + 2]) * (positions[a] + positions[b])
      normal.z += (positions[a] - positions[b]) * (positions[a + 1] + positions[b + 1])
    }
    const axes = [Math.abs(normal.x), Math.abs(normal.y), Math.abs(normal.z)]
    const drop = axes.indexOf(Math.max(...axes)), keep = [0, 1, 2].filter(axis => axis !== drop)
    if (axes[drop] === 0) throw new Error(`Degenerate OFF face ${i}.`)
    const contour = polygon.map(index => new THREE.Vector2(positions[index * 3 + keep[0]], positions[index * 3 + keep[1]]))
    const result = THREE.ShapeUtils.triangulateShape(contour, [])
    if (result.length !== count - 2) throw new Error(`Cannot triangulate OFF face ${i}.`)
    result.forEach(triangle => {
      const output = triangle.map(index => polygon[index])
      const a = new THREE.Vector3().fromArray(positions, output[0] * 3), b = new THREE.Vector3().fromArray(positions, output[1] * 3), c = new THREE.Vector3().fromArray(positions, output[2] * 3)
      if (b.sub(a).cross(c.sub(a)).dot(normal) < 0) output.reverse()
      triangles.push(...output)
    })
  }
  const geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(positions, 3))
  if (colors) geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  if (normals) geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
  if (!faces) return new THREE.Points(geometry, new THREE.PointsMaterial({ color: colors ? 0xffffff : 0xcccccc, vertexColors: !!colors }))
  geometry.setIndex(triangles)
  if (!normals) geometry.computeVertexNormals()
  return new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: colors ? 0xffffff : 0xcccccc, vertexColors: !!colors, side: THREE.DoubleSide }))
}

export function parseSceneFileVTK (buffer) {
  // r120 reads a 250-byte header unconditionally, even for valid tiny files.
  // Its binary line scanner also needs a final newline to terminate safely.
  if (buffer.byteLength < 250 || new Uint8Array(buffer)[buffer.byteLength - 1] !== 10) {
    const padded = new Uint8Array(Math.max(250, buffer.byteLength + 1)).fill(10)
    padded.set(new Uint8Array(buffer)); buffer = padded.buffer
  }
  const geometry = new VTKLoader().parse(buffer)
  if ((geometry.index && !geometry.index.count) || !geometry.getAttribute('position')?.count) {
    geometry.dispose()
    throw new Error('VTK/VTP must contain polygon or triangle-strip surface geometry; point/line-only datasets are not supported.')
  }
  if (!geometry.getAttribute('normal')) geometry.computeVertexNormals()
  return new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0xcccccc, side: THREE.DoubleSide, vertexColors: !!geometry.getAttribute('color') }))
}

export function parseSceneFileNumeric (buffer, { format, name = `scene.${format}`, signal } = {}) {
  checkSceneFileAbort(signal)
  const warnings = []
  let root
  try {
    if (format === 'xyz') root = parseXYZ(textOf(buffer))
    else if (format === 'off') root = parseOFF(textOf(buffer), warnings)
    else if (format === 'pcd') {
      const prefix = textOf(buffer.slice(0, Math.min(buffer.byteLength, 65536)))
      const dataMatch = /^DATA\s+(ascii|binary|binary_compressed)\s*$/m.exec(prefix)
      if (!dataMatch) throw new Error('PCD requires an ASCII, binary, or binary_compressed DATA header.')
      const header = prefix.slice(0, dataMatch.index)
      const values = key => (new RegExp(`^${key}\\s+([^\\r\\n]+)`, 'm').exec(header)?.[1] || '').trim().split(/\s+/)
      const fields = values('FIELDS'), sizes = values('SIZE').map(Number), types = values('TYPE'), counts = values('COUNT').map(Number)
      if (!['x', 'y', 'z'].every(field => fields.includes(field))) throw new Error('PCD must contain x, y, and z fields.')
      if (/^COUNT\s/m.test(header) && counts.some(count => count !== 1)) throw new Error('PCD multi-count fields are unsupported.')
      if (dataMatch[1] !== 'ascii') {
        for (const field of ['x', 'y', 'z', 'normal_x', 'normal_y', 'normal_z']) {
          const index = fields.indexOf(field)
          if (index >= 0 && (sizes[index] !== 4 || types[index] !== 'F')) throw new Error('Binary PCD positions and normals must be Float32.')
        }
      }
      root = new PCDLoader().parse(buffer, name)
      const position = root.geometry.getAttribute('position')
      const valid = []
      for (let i = 0; i < (position?.count || 0); i++) if ([position.getX(i), position.getY(i), position.getZ(i)].every(Number.isFinite)) valid.push(i)
      if (position && valid.length !== position.count) {
        warnings.push(`${position.count - valid.length} PCD points with non-finite positions were omitted.`)
        for (const [key, attribute] of Object.entries(root.geometry.attributes)) {
          const array = new Float32Array(valid.length * attribute.itemSize)
          valid.forEach((index, output) => array.set(attribute.array.subarray(index * attribute.itemSize, (index + 1) * attribute.itemSize), output * attribute.itemSize))
          root.geometry.setAttribute(key, new THREE.BufferAttribute(array, attribute.itemSize))
        }
      }
      root.material.color.setHex(root.geometry.getAttribute('color') ? 0xffffff : 0xcccccc)
      warnings.push('PCD is imported in stored coordinates; VIEWPOINT and non-position/color/normal fields are not applied.')
    } else if (format === 'vtk') {
      const text = textOf(buffer)
      if (!/^# vtk DataFile Version /i.test(text)) throw new Error('Expected a legacy VTK POLYDATA file; use .vtp for XML PolyData.')
      if (/\n\s*(LINES|VERTICES)\s+[1-9]/.test(text)) throw new Error('Mixed VTK line/vertex cells are unsupported; export polygon-only POLYDATA.')
      root = parseSceneFileVTK(buffer)
      warnings.push('VTK imports polygon/triangle-strip surfaces; scientific scalar fields are not preserved.')
    } else throw new Error(`Unsupported numeric scene format: ${format}`)
    root.name = root.name || name
    return sceneFileRecords(root, { name, format, warnings, signal })
  } finally { disposeSceneFileObject(root) }
}
