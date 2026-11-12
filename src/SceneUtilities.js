import * as THREE from 'three'
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js'
import PandaUIApp from './PandaUIApp'
import { createPointMaterial } from './PointDisplaySettings'
// import GlslGrid from './GlslGrid.js'
import GlslLineList from './GlslLineList'
import releaseTable from './import/releaseTable'
import { hasMeshTriangles } from '../public/nodec/BrepMeshing'
import { validateDisplayPreview } from '../public/nodec/BrepDisplayMeshing'
import { rhinoRenderMaterial } from './import/RhinoMaterials'

function meshVertexCount (mesh) {
  const vertices = mesh.vertices()
  try { return vertices.count } finally { vertices.delete() }
}

function meshingDiagnostic (preview) {
  return { status: preview.status, message: preview.message, faceCount: preview.faceCount, sourceFaceCount: preview.sourceFaceCount || preview.faceCount, failedFaces: preview.failedFaces?.map(f => ({ ...f })) || [], engine: preview.engine, repairedBoundarySlivers: preview.repairedBoundarySlivers || 0, discardedDegenerateTriangles: preview.discardedDegenerateTriangles || 0, repairedNormalTriangles: preview.repairedNormalTriangles || 0, maximumBoundaryDeviation: preview.maximumBoundaryDeviation || 0, ...(preview.origin ? { origin: preview.origin.slice() } : {}) }
}

function curveToPoints (curve, pointLimit = 100) {
  let rhino3dm = PandaUIApp.getRhino3dm()
  let pointCount = pointLimit
  let rc = []
  let ts = []

  if (curve instanceof rhino3dm.LineCurve) {
    return [curve.pointAtStart, curve.pointAtEnd]
  }

  if (curve instanceof rhino3dm.PolylineCurve) {
    pointCount = curve.pointCount
    for (let i = 0; i < pointCount; i++) {
      rc.push(curve.point(i))
    }
    return rc
  }

  if (curve instanceof rhino3dm.PolyCurve) {
    let segmentCount = curve.segmentCount
    for (let i = 0; i < segmentCount; i++) {
      let segment = curve.segmentCurve(i)
      let segmentArray = curveToPoints(segment, pointCount)
      rc = rc.concat(segmentArray)
      segment.delete()
    }
    return rc
  }

  if (curve instanceof rhino3dm.NurbsCurve && curve.degree === 1) {
    console.info('degree 1 curve')
  }

  const domain = curve.domain
  // Rhino3dm curve wrappers do not consistently expose a length method.
  // Use a compact candidate set and retain samples based on tangent rotation.
  const divisions = Math.max(8, Math.min(pointLimit, 32))
  const turnTolerance = Math.PI / 90
  let previousTangent = null
  for (let j = 0; j <= divisions; j++) {
    const t = domain[0] + (j / divisions) * (domain[1] - domain[0])
    const tangent = curve.tangentAt(t)
    const tangentVector = new THREE.Vector3(tangent[0], tangent[1], tangent[2])
    if (j === 0 || j === divisions || previousTangent == null || tangentVector.angleTo(previousTangent) >= turnTolerance) {
      ts.push(t)
      previousTangent = tangentVector
    }
  }
  rc = ts.map(t => curve.pointAt(t))
  return rc
}

function getMaterialAppearance (doc, attributes) {
  let materials = doc.materials()
  let material = materials.findFromAttributes(attributes)
  const appearance = { id: 0, diffuse: null }
  if (material) {
    appearance.id = material.id
    appearance.diffuse = material.diffuseColor
    appearance.render = rhinoRenderMaterial(material, doc, PandaUIApp.getRhino3dm())
    material.delete()
  }
  releaseTable(materials)
  return appearance
}

function colorToThree (color, fallback) {
  if (color == null) return fallback.clone()
  return new THREE.Color(color.r / 255.0, color.g / 255.0, color.b / 255.0)
}

function surfaceColorToThree (color, fallback) {
  const threeColor = colorToThree(color, fallback)
  return threeColor.r === 0 && threeColor.g === 0 && threeColor.b === 0
    ? new THREE.Color(0.3, 0.3, 0.3)
    : threeColor
}

let SceneUtilities = {
  subdSource (geometry, attributes) {
    return { geometry: geometry.subdArchive || geometry.encode(), attributes: Array.from(PandaUIApp.getRhino3dm().nodecEncodeAttributes(attributes)) }
  },
  subdSourceHeader (doc) { return PandaUIApp.getRhino3dm().nodecDocumentHeader(doc) },
  createGrid (gridSpacing = 1.0, gridLineCount = 70, gridThickFrequency = 5) {
    const xMin = -gridLineCount * gridSpacing
    const yMin = xMin
    const xMax = gridLineCount * gridSpacing
    const yMax = xMax
    let grid = new THREE.Group()
    let minorLines = []
    let majorLines = []
    for (let i = -gridLineCount; i <= gridLineCount; i++) {
      let x = i * gridSpacing
      let y = i * gridSpacing
      if (i === 0) {
        majorLines.push(new THREE.Vector3(0, yMin, 0))
        majorLines.push(new THREE.Vector3(0, 0, 0))
        majorLines.push(new THREE.Vector3(xMin, 0, 0))
        majorLines.push(new THREE.Vector3(0, 0, 0))
        continue
      }

      if (i % gridThickFrequency === 0) {
        majorLines.push(new THREE.Vector3(x, yMin, 0))
        majorLines.push(new THREE.Vector3(x, yMax, 0))
        majorLines.push(new THREE.Vector3(xMin, y, 0))
        majorLines.push(new THREE.Vector3(xMax, y, 0))
      } else {
        minorLines.push(new THREE.Vector3(x, yMin, 0))
        minorLines.push(new THREE.Vector3(x, yMax, 0))
        minorLines.push(new THREE.Vector3(xMin, y, 0))
        minorLines.push(new THREE.Vector3(xMax, y, 0))
      }
    }

    grid.add(GlslLineList.createThreeObjectFromLines(minorLines,
      new THREE.Color(147 / 255, 153 / 255, 160 / 255),
      1.0,
      false))

    grid.add(GlslLineList.createThreeObjectFromLines(majorLines,
      new THREE.Color(129 / 255, 134 / 255, 140 / 255),
      1.0,
      false))

    let lineList = new GlslLineList(false)
    lineList.addLine(new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(xMax, 0, 0),
      new THREE.Color(150 / 255, 75 / 255, 75 / 255),
      2.0)
    lineList.addLine(new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, yMax, 0),
      new THREE.Color(75 / 255, 150 / 255, 75 / 255),
      2.0)
    grid.add(lineList.createThreeObject())

    return grid
  },
  meshWiresToThreejs (mesh, color) {
    const edges = mesh.topologyEdges()
    let verts
    try {
      if (typeof edges.edgesToArray === 'function') verts = new Float32Array(edges.edgesToArray())
      else {
        verts = new Float32Array(edges.count * 6)
        for (let index = 0; index < edges.count; index++) {
          const edge = edges.edgeLine(index)
          try {
            verts.set(edge.from, index * 6)
            verts.set(edge.to, index * 6 + 3)
          } finally { edge.delete() }
        }
      }
    } finally { edges.delete() }
    let points = new THREE.BufferGeometry()
    points.setAttribute('position', new THREE.BufferAttribute(verts, 3))
    let threecolor = new THREE.Color(color.r / 255.0, color.g / 255.0, color.b / 255.0)
    let wireMaterial = GlslLineList.getBiasLinesMaterial(threecolor) // new THREE.LineBasicMaterial({ color: threecolor })
    let wires = new THREE.LineSegments(points, wireMaterial)
    wires.userData['surfaceWires'] = true
    return wires
  },
  meshToThreejs (mesh, displayColor, materialId, materialDiffuse = null, importedMaterial = null) {
    let geometry = new THREE.BufferGeometry()
    if (typeof mesh.toThreejsBuffers === 'function') {
      // Rhino3dm 8 exports typed arrays in bulk. This avoids constructing a
      // large JSON object for every mesh during incremental scene conversion.
      const buffers = mesh.toThreejsBuffers(false)
      geometry.setAttribute('position', new THREE.BufferAttribute(buffers.position, 3))
      if (buffers.normal != null && buffers.normal.length > 0) {
        geometry.setAttribute('normal', new THREE.BufferAttribute(buffers.normal, 3))
      }
      if (buffers.uv != null && buffers.uv.length > 0) {
        geometry.setAttribute('uv', new THREE.BufferAttribute(buffers.uv, 2))
      }
      if (buffers.color != null && buffers.color.length > 0) {
        geometry.setAttribute('color', new THREE.BufferAttribute(buffers.color, 3))
      }
      if (buffers.index != null && buffers.index.length > 0) {
        geometry.setIndex(new THREE.BufferAttribute(buffers.index, 1))
      }
    } else {
      let meshes = Array.isArray(mesh) ? mesh : [mesh]
      let rhino3dm = PandaUIApp.getRhino3dm()
      let loader = new THREE.BufferGeometryLoader()
      let data = rhino3dm.Mesh.toThreejsJSONMerged(meshes, false)
      geometry = loader.parse(data)
    }
    if (!geometry.getAttribute('normal')) geometry.computeVertexNormals()
    const shadingColor = surfaceColorToThree(displayColor, new THREE.Color(1, 1, 1))
    const renderColor = surfaceColorToThree(materialDiffuse, shadingColor)
    const shadingMaterial = new THREE.MeshPhongMaterial({
      color: shadingColor,
      emissive: shadingColor.clone().multiplyScalar(0.045),
      specular: new THREE.Color(0x8a949c),
      shininess: 42,
      toneMapped: false,
      side: THREE.DoubleSide,
      transparent: false,
      opacity: 1,
      depthTest: true,
      depthWrite: true
    })
    // Rhino3dm's browser API does not expose all Rhino Render material
    // parameters. This remains a useful physical fallback for locally parsed
    // models; backend chunks provide their native metalness and roughness.
    const renderMaterial = importedMaterial || new THREE.MeshPhysicalMaterial({
      color: renderColor,
      metalness: 0.12,
      roughness: 0.42,
      clearcoat: 0.08,
      clearcoatRoughness: 0.28,
      side: THREE.FrontSide,
      depthTest: true,
      depthWrite: true
    })
    if (renderMaterial.aoMap && geometry.getAttribute('uv') && !geometry.getAttribute('uv2')) geometry.setAttribute('uv2', geometry.getAttribute('uv'))
    let meshObject = new THREE.Mesh(geometry, shadingMaterial)
    meshObject.userData['diffuse'] = renderColor

    meshObject.userData['materialId'] = materialId
    meshObject.userData.displayMaterials = { shading: shadingMaterial, render: renderMaterial }
    return meshObject
  },
  createThreeGeometryOnLayer (items, doc, disposablesList, renderWires = true, conversionBudget = null, edgesOnly = false) {
    let rhino3dm = PandaUIApp.getRhino3dm()
    let deleteList = []
    let materials = doc.materials()

    let objectsToAdd = []
    const addMeshImmediately = (color, material, mesh, ownsMesh) => {
      try {
        const vertexCount = meshVertexCount(mesh)
        if (conversionBudget != null && conversionBudget.vertices + vertexCount > conversionBudget.maxVertices) {
          throw new Error(`Document exceeds the ${conversionBudget.maxVertices} vertex import budget`)
        }
        const bbox = mesh.getBoundingBox()
        const materialId = material == null ? 0 : material.id
        const threeMesh = this.meshToThreejs(mesh, color, materialId, material == null ? null : material.diffuseColor, rhinoRenderMaterial(material, doc, rhino3dm))
        disposablesList.push(threeMesh.geometry)
        disposablesList.push(threeMesh.material)
        objectsToAdd.push([threeMesh, bbox])
        if (conversionBudget != null) conversionBudget.vertices += vertexCount
      } finally {
        // Face, SubD, and extrusion meshes are temporary Rhino/WASM objects.
        // Always release them, including JSON conversion failure paths.
        if (ownsMesh) mesh.delete()
      }
    }
    try {
      for (let i = 0; i < items.length; i++) {
        let geometry = items[i][0]
        let attributes = items[i][1]
        const objectType = geometry.objectType
        switch (objectType) {
          case rhino3dm.ObjectType.Brep:
            {
              // The first import pass mounts analytic wires without inspecting
              // mesh caches or counting deferred surfaces as conversion failures.
              if (edgesOnly) break
              let color = attributes.drawColor(doc)
              let material = materials.findFromAttributes(attributes)
              deleteList.push(material)
              let faces = geometry.faces()
              let missingMeshes = 0
              const firstPart = objectsToAdd.length
              const preview = items[i][2] ? validateDisplayPreview(items[i][2], faces.count) : null
              items[i][2] = preview
              try {
                if (preview?.status === 'success' || preview?.status === 'partial') {
                  const chunks = [preview, ...(preview.meshParts || [])]
                  const vertexCount = chunks.reduce((sum, part) => sum + part.positions.length / 3, 0)
                  if (conversionBudget && conversionBudget.vertices + vertexCount > conversionBudget.maxVertices) throw new Error(`Document exceeds the ${conversionBudget.maxVertices} vertex import budget`)
                  // Retain these exact worker buffers for rendering, sharing,
                  // raycasting, and face selection. No second tessellation.
                  for (const chunk of chunks) {
                    const threeMesh = this.meshToThreejs({ toThreejsBuffers: () => ({ position: chunk.positions, normal: chunk.normals, index: chunk.indices, uv: chunk.uv }) }, color, material?.id || 0, material?.diffuseColor, rhinoRenderMaterial(material, doc, rhino3dm))
                    if (chunk.origin) threeMesh.position.fromArray(chunk.origin)
                    disposablesList.push(threeMesh.geometry, threeMesh.material)
                    if (chunk.faceRanges) threeMesh.userData.faceRanges = chunk.faceRanges.map(range => ({ faceIndex: range.faceIndex, indexStart: range.firstIndex, indexCount: range.indexCount }))
                    threeMesh.userData.geometryType = 'Brep'
                    objectsToAdd.push([threeMesh, geometry.getBoundingBox()])
                  }
                  missingMeshes = preview.failedFaces?.length || 0
                  if (conversionBudget) conversionBudget.vertices += vertexCount
                } else {
                  for (let faceIndex = 0; faceIndex < faces.count; faceIndex++) {
                    let face = null, mesh = null
                    try {
                      face = faces.get(faceIndex)
                      mesh = face.getMesh(rhino3dm.MeshType.Any)
                      if (hasMeshTriangles(mesh)) addMeshImmediately(color, material, mesh, false)
                      else missingMeshes++
                    } catch (error) {
                      missingMeshes++
                      console.warn(`Skipped Brep face ${faceIndex + 1}:`, error)
                    } finally {
                      if (mesh != null) mesh.delete()
                      if (face != null) face.delete()
                    }
                  }
                }
              } finally { faces.delete() }
              if (preview) {
                for (let part = firstPart; part < objectsToAdd.length; part++) objectsToAdd[part][0].userData.brepMeshing = meshingDiagnostic(preview)
                if (preview.status === 'failed' || preview.status === 'partial') {
                  console.warn(`Brep meshing ${preview.status} for ${attributes.id || attributes.name || 'object'}: ${preview.message}`)
                  if (conversionBudget) {
                    conversionBudget.meshingFailures = (conversionBudget.meshingFailures || 0) + 1
                    const messages = (conversionBudget.meshingMessages ||= [])
                    if (messages.length < 10) messages.push({ objectId: attributes.id, status: preview.status, message: preview.message, failedFaces: preview.failedFaces?.map(f => ({ ...f })) || [] })
                  }
                }
              }
              if (missingMeshes && conversionBudget) {
                conversionBudget.missingMeshFaces = (conversionBudget.missingMeshFaces || 0) + missingMeshes
                conversionBudget.missingMeshObjects = (conversionBudget.missingMeshObjects || 0) + 1
              }
            }
            break
          case rhino3dm.ObjectType.Mesh:
            {
              let color = attributes.drawColor(doc)
              let material = materials.findFromAttributes(attributes)
              deleteList.push(material)
              addMeshImmediately(color, material, geometry, false)
            }
            break
          case rhino3dm.ObjectType.SubD:
            {
              let mesh = geometry.displayMesh ? geometry.displayMesh() : rhino3dm.nodecSubDDisplayMesh(geometry, geometry.subdDisplayMode !== 'mesh', 3)
              let color = attributes.drawColor(doc)
              let material = materials.findFromAttributes(attributes)
              deleteList.push(material)
              addMeshImmediately(color, material, mesh, true)
            }
            break
          case rhino3dm.ObjectType.Extrusion:
            {
              let mesh = geometry.getMesh(rhino3dm.MeshType.Any)
              if (mesh) {
                let color = attributes.drawColor(doc)
                let material = materials.findFromAttributes(attributes)
                deleteList.push(material)
                addMeshImmediately(color, material, mesh, true)
              } else if (conversionBudget) {
                conversionBudget.missingMeshObjects = (conversionBudget.missingMeshObjects || 0) + 1
              }
            }
            break
          default:
            break
        }
      }

      for (let i = 0; i < items.length; i++) {
        let geometry = items[i][0]
        let attrs = items[i][1]
        let abc = this.createThreeGeometry(geometry, attrs, doc, disposablesList, false, renderWires, new Set(), items[i][3])
        if (items[i][2]) abc.forEach(([part]) => part.traverse(child => { child.userData.brepMeshing = meshingDiagnostic(items[i][2]) }))
        objectsToAdd = objectsToAdd.concat(abc)
      }

      return objectsToAdd
    } finally {
      for (let i = 0; i < deleteList.length; i++) {
        let itemToDelete = deleteList[i]
        if (itemToDelete != null) itemToDelete.delete()
      }
      releaseTable(materials)
    }
  },
  createThreeGeometry (geometry, attributes, doc, disposablesList, createMeshes, renderWires = true, instancePath = new Set(), edgePreview = null) {
    let rhino3dm = PandaUIApp.getRhino3dm()
    let objectsToAdd = []
    let color = attributes.drawColor(doc)
    const objectType = geometry.objectType
    if (!createMeshes && renderWires && edgePreview && (objectType === rhino3dm.ObjectType.Brep || objectType === rhino3dm.ObjectType.Curve)) {
      const { positions, origin, warnings = [], limitedSegments = 0 } = edgePreview
      if (!(positions instanceof Float32Array) || positions.length % 6 || !positions.every(Number.isFinite) || !Array.isArray(origin) || origin.length !== 3 || !origin.every(Number.isFinite)) throw new Error('Invalid edge preview buffer.')
      if (warnings.length || limitedSegments) console.warn('Incomplete edge sampling:', { objectId: attributes.id, warnings, limitedSegments })
      if (!positions.length) return objectsToAdd
      const buffer = new THREE.BufferGeometry()
      buffer.setAttribute('position', new THREE.BufferAttribute(positions, 3))
      const material = GlslLineList.getBiasLinesMaterial(new THREE.Color(color.r / 255, color.g / 255, color.b / 255))
      const lines = new THREE.LineSegments(buffer, material)
      lines.position.fromArray(origin)
      lines.userData.edgeSampling = { tolerance: edgePreview.tolerance, angle: edgePreview.angle, warnings, limitedSegments }
      const wires = new THREE.Group()
      wires.userData.edgeLines = true
      if (objectType === rhino3dm.ObjectType.Brep) wires.userData.surfaceWires = true
      wires.add(lines)
      disposablesList.push(buffer, material)
      objectsToAdd.push([wires, geometry.getBoundingBox()])
      return objectsToAdd
    }
    switch (objectType) {
      case rhino3dm.ObjectType.Point:
        {
          let pointMaterial = createPointMaterial({ color: color })
          let pointGeometry = new THREE.BufferGeometry()
          let pt = geometry.location
          pointGeometry.setAttribute('position', new THREE.Float32BufferAttribute(pt, 3))
          disposablesList.push(pointMaterial)
          disposablesList.push(pointGeometry)
          objectsToAdd.push([new THREE.Points(pointGeometry, pointMaterial), geometry.getBoundingBox()])
        }
        break
      case rhino3dm.ObjectType.PointSet:
        {
          let pointMaterial = createPointMaterial({ color: color })
          let pointGeometry = new THREE.BufferGeometry()
          disposablesList.push(pointMaterial)
          disposablesList.push(pointGeometry)
          let count = geometry.count
          const positions = new Float32Array(count * 3)
          for (let i = 0; i < count; i++) {
            let pt = geometry.pointAt(i)
            positions.set(pt, i * 3)
          }
          pointGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
          objectsToAdd.push([new THREE.Points(pointGeometry, pointMaterial), geometry.getBoundingBox()])
        }
        break
      case rhino3dm.ObjectType.Curve:
        {
          let points = curveToPoints(geometry, 100)
          let linelist = new GlslLineList(true)
          let threecolor = new THREE.Color(color.r / 255.0, color.g / 255.0, color.b / 255.0)
          // Keep CPU geometry as real line segments for raycasting, selection
          // and display sharing. EdgeDisplayRenderer handles screen-space width.
          linelist.addPolyline(points, threecolor, 1)
          let threeObject = linelist.createThreeObject()
          disposablesList.push(threeObject.geometry)
          disposablesList.push(threeObject.material)
          objectsToAdd.push([threeObject, geometry.getBoundingBox()])
        }
        break
      case rhino3dm.ObjectType.Surface:
        console.warn('TODO: Implement surface')
        break
      case rhino3dm.ObjectType.Brep:
        if (createMeshes) {
          let materialAppearance = getMaterialAppearance(doc, attributes)
          let faces = geometry.faces()
          for (let faceIndex = 0; faceIndex < faces.count; faceIndex++) {
            let face = faces.get(faceIndex)
            let mesh = face.getMesh(rhino3dm.MeshType.Any)
            if (mesh) {
              let threeMesh = this.meshToThreejs(mesh, color, materialAppearance.id, materialAppearance.diffuse, materialAppearance.render)
              disposablesList.push(threeMesh.geometry)
              disposablesList.push(threeMesh.material)
              objectsToAdd.push([threeMesh, mesh.getBoundingBox()])
              mesh.delete()
            }
            face.delete()
          }
          faces.delete()
        }
        if (renderWires) {
          let wires = new THREE.Group()
          wires.userData['surfaceWires'] = true
          wires.userData['edgeLines'] = true
          let edges = geometry.edges()
          const linelist = new GlslLineList(true)
          const threecolor = new THREE.Color(color.r / 255.0, color.g / 255.0, color.b / 255.0)
          try {
            for (let edgeIndex = 0; edgeIndex < edges.count; edgeIndex++) {
              const edge = edges.get(edgeIndex)
              try { linelist.addPolyline(curveToPoints(edge, 100), threecolor, 1) } finally { edge.delete() }
            }
          } finally { edges.delete() }
          // Each polyline remains disconnected, but all edges of this Brep
          // share one buffer/material/draw call (including every placement).
          if (linelist._starts.length) {
            const threeObject = linelist.createThreeObject()
            disposablesList.push(threeObject.geometry, threeObject.material)
            wires.add(threeObject)
          }
          objectsToAdd.push([wires, geometry.getBoundingBox()])
        }
        break
      case rhino3dm.ObjectType.Mesh:
        if (createMeshes) {
          let materialAppearance = getMaterialAppearance(doc, attributes)
          let threeMesh = this.meshToThreejs(geometry, color, materialAppearance.id, materialAppearance.diffuse, materialAppearance.render)
          disposablesList.push(threeMesh.geometry)
          disposablesList.push(threeMesh.material)
          objectsToAdd.push([threeMesh, geometry.getBoundingBox()])
        }
        if (renderWires) {
          let wires = this.meshWiresToThreejs(geometry, color)
          disposablesList.push(wires.geometry)
          disposablesList.push(wires.material)
          objectsToAdd.push([wires, geometry.getBoundingBox()])
        }
        break
      case rhino3dm.ObjectType.Light:
        console.warn('TODO: Implement light')
        break
      case rhino3dm.ObjectType.Annotation:
        console.warn('TODO: Implement annotation')
        break
      case rhino3dm.ObjectType.InstanceReference:
        {
          let parentId = geometry.parentIdefId
          if (instancePath.has(parentId)) throw new Error('Cyclic block instance definition.')
          const childPath = new Set(instancePath).add(parentId)
          const transform = geometry.xform
          let xf = transform.toFloatArray(true)
          let bbox = null
          let group = new THREE.Group()
          let matrix = new THREE.Matrix4()
          matrix.set(xf[0], xf[1], xf[2], xf[3], xf[4], xf[5], xf[6], xf[7],
            xf[8], xf[9], xf[10], xf[11], xf[12], xf[13], xf[14], xf[15])
          group.applyMatrix(matrix)

          let idefTable = doc.instanceDefinitions()
          let objectTable = doc.objects()
          let idef = idefTable.findId(parentId)
          try {
            if (!idef) throw new Error('Missing block instance definition.')
            for (const id of idef.getObjectIds()) {
              let modelObject, childGeometry, attr
              try {
                modelObject = objectTable.findId(id)
                if (!modelObject) throw new Error('Missing block definition geometry.')
                childGeometry = modelObject.geometry()
                attr = modelObject.attributes()
                const children = this.createThreeGeometry(childGeometry, attr, doc, disposablesList, true, renderWires, childPath)
                children.forEach(([child, childBbox]) => {
                  if (childBbox) {
                    childBbox.transform(transform)
                    if (bbox == null) bbox = childBbox
                    else {
                      const combined = rhino3dm.BoundingBox.union(bbox, childBbox)
                      bbox.delete(); childBbox.delete(); bbox = combined
                    }
                  }
                  if (attr.visible === false) {
                    const hiddenGroup = new THREE.Group()
                    hiddenGroup.name = attr.name || child.name || 'Hidden instance object'
                    hiddenGroup.userData.pandauiHidden = true
                    hiddenGroup.visible = false
                    hiddenGroup.add(child)
                    group.add(hiddenGroup)
                  } else group.add(child)
                })
              } finally { attr?.delete(); childGeometry?.delete(); modelObject?.delete() }
            }
          } catch (error) { bbox?.delete(); throw error } finally {
            idef?.delete(); releaseTable(idefTable); releaseTable(objectTable); transform.delete()
          }
          objectsToAdd.push([group, bbox])
        }
        break
      case rhino3dm.ObjectType.TextDot:
        let dotDiv = document.createElement('div')
        dotDiv.style.fontFamily = geometry.fontFace
        dotDiv.style.fontSize = `${geometry.fontHeight}px`
        dotDiv.style.marginTop = '-1em'
        dotDiv.style.color = '#FFF'
        dotDiv.style.padding = '2px'
        dotDiv.style.paddingRight = '5px'
        dotDiv.style.paddingLeft = '5px'
        dotDiv.style.borderRadius = '5px'
        dotDiv.style.background = `rgba(${color.r},${color.g},${color.b},${color.a})`
        dotDiv.textContent = geometry.text
        let dot = new CSS2DObject(dotDiv)
        let location = geometry.point
        dot.position.set(location[0], location[1], location[2])
        objectsToAdd.push([dot, null])
        break
      case rhino3dm.ObjectType.Hatch:
        console.warn('TODO: Implement hatch')
        break
      case rhino3dm.ObjectType.SubD:
        if (createMeshes) {
          let mesh = geometry.displayMesh ? geometry.displayMesh() : rhino3dm.nodecSubDDisplayMesh(geometry, geometry.subdDisplayMode !== 'mesh', 3)
          let materialAppearance = getMaterialAppearance(doc, attributes)
          let threeMesh = this.meshToThreejs(mesh, color, materialAppearance.id, materialAppearance.diffuse, materialAppearance.render)
          disposablesList.push(threeMesh.geometry)
          disposablesList.push(threeMesh.material)
          objectsToAdd.push([threeMesh, geometry.getBoundingBox()])
          mesh.delete()
        }
        break
      case rhino3dm.ObjectType.ClipPlane:
        let normal = geometry.normalAt(0, 0)
        let center = geometry.pointAt(0, 0)
        let clippingPlane = new THREE.Plane(new THREE.Vector3(normal[0], normal[1], normal[2]), 0)
        clippingPlane.translate(new THREE.Vector3(center[0], center[1], center[2]))
        objectsToAdd.push([clippingPlane, null])
        break
      case rhino3dm.ObjectType.Extrusion:
        if (createMeshes) {
          let mesh = geometry.getMesh(rhino3dm.MeshType.Any)
          if (mesh) {
            let materialAppearance = getMaterialAppearance(doc, attributes)
            let threeMesh = this.meshToThreejs(mesh, color, materialAppearance.id, materialAppearance.diffuse, materialAppearance.render)
            disposablesList.push(threeMesh.geometry)
            disposablesList.push(threeMesh.material)
            objectsToAdd.push([threeMesh, mesh.getBoundingBox()])
            mesh.delete()
          }
        }
        break
      default:
        break
    }
    return objectsToAdd
  },
  viewportSize: new THREE.Vector2(0, 0)
}

export default SceneUtilities
