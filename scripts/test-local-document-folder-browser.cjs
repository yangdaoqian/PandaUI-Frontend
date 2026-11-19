// Runs the production File/Worker pipeline first, then folder round-trip tests.
// Usage: node scripts/test-local-document-folder-browser.cjs [dist/spa]
const assert = require('node:assert/strict')
const { main } = require('./test-step-progressive-browser.cjs')
main({ afterFixtures: async ({ page, report }) => {
    await page.evaluate(() => window.testBegin('folder-source.step', '/__step_test__/assembly.step'))
    await page.waitForFunction(() => window.stepRun.settled)
    report.folder = await page.evaluate(async () => {
      const requireValue = (value, message) => { if (!value) throw new Error(message) }
      const app = window.testApp, doc = app.modelDocuments()[0]
      const directory = await (await navigator.storage.getDirectory()).getDirectoryHandle('folder-test-' + crypto.randomUUID(), { create: true })
      const placements = []
      doc.three.middleground.traverse(root => { if (root.userData.importedModelObject) placements.push(root) })
      requireValue(placements.length > 0, 'Missing source placements')
      placements[0].position.x += 17; placements[0].updateMatrix()
      // Preserve exact imported affine transforms, including shear which cannot
      // be represented by decomposed position/quaternion/scale alone.
      placements[0].matrixAutoUpdate = false
      placements[0].matrix.elements[4] += 0.125
      const selectedId = placements[0].userData.pandauiObjectId, sourceId = placements[0].userData.sourceGeometryId
      if (placements[1]) { placements[1].visible = false; placements[1].userData.pandauiHidden = true }
      let material
      placements[0].traverse(part => { material ||= part.userData.displayMaterials?.render })
      if (material?.color) material.color.setRGB(0.15, 0.35, 0.65)
      const archive = doc.importedGeometrySources.get(sourceId)
      requireValue(archive?.geometry?.data, 'Original Brep archive missing')
      doc.geometryEdits = new Map([[selectedId, { documentId: doc.documentId, objectId: selectedId, sourceGeometryId: sourceId, geometry: archive.geometry, attributes: archive.attributes }]])
      const snapshot = () => {
        const entries = []
        doc.three.middleground.traverse(root => {
          if (root.userData.importedModelObject || root.userData.importedBlockInstance) {
            root.updateWorldMatrix(true, false)
            entries.push({ id: root.userData.pandauiObjectId, matrix: root.matrixWorld.toArray(), hidden: !!root.userData.pandauiHidden, kind: root.userData.geometryType })
          }
        })
        return entries.sort((a, b) => a.id.localeCompare(b.id))
      }
      const before = snapshot(), documentId = doc.documentId
      const first = await app.saveLocalDocumentFolder(documentId, { directory })
      const second = await app.saveLocalDocumentFolder(documentId, { directory })
      requireValue(second.sequence === first.sequence + 1, 'Incremental commit sequence missing')
      // Regression: render-only archives must include displayMaterials.render
      // even when it is a different material from the active shading material.
      let renderMaterial
      placements[0].traverse(part => {
        const bag = part.userData.displayMaterials
        if (!renderMaterial && bag?.render?.clone) {
          renderMaterial = bag.render.clone()
          renderMaterial.color?.setRGB(0.72, 0.18, 0.08)
          part.userData.displayMaterials = { ...bag, render: renderMaterial }
        }
      })
      const renderDirectory = await (await navigator.storage.getDirectory()).getDirectoryHandle('render-test-' + crypto.randomUUID(), { create: true })
      const renderCommit = await app.saveLocalRenderDataFolder(documentId, { directory: renderDirectory })
      requireValue(renderCommit.records > 0, 'Render archive did not commit display records')
      await window.PandaUISceneWorkspace.closeLocalPrivate(documentId)
      requireValue(!app.modelDocuments().some(model => model.documentId === documentId), 'Close local document failed')
      const renderDoc = await app.openLocalRenderDataFolder({ directory: renderDirectory })
      let renderMatches = 0
      renderDoc.three.middleground.traverse(part => {
        const color = part.userData.displayMaterials?.render?.color
        if (color && Math.abs(color.r - 0.72) < 1e-8 && Math.abs(color.g - 0.18) < 1e-8 && Math.abs(color.b - 0.08) < 1e-8) renderMatches++
      })
      requireValue(!renderMaterial || renderMatches > 0, 'Render-only material library did not restore the render material')
      app.removeSceneDocuments([renderDoc.documentId])
      const start = performance.now(), stages = []
      const remeshCount = window.stepRun.meshTasks.length
      const restored = await app.openLocalDocumentFolder({ directory, onProgress: p => stages.push(p) })
      const elapsedMs = performance.now() - start
      requireValue(restored.documentId === documentId, 'Document ID changed')
      requireValue(restored.importedGeometrySources.size === 0 && restored.localGeometryRefs.size > 0, 'Original geometry must stay lazy')
      requireValue(window.stepRun.meshTasks.length === remeshCount, 'Cached open unexpectedly remeshed')
      const after = []
      restored.three.middleground.traverse(root => {
        if (root.userData.importedModelObject || root.userData.importedBlockInstance) {
          root.updateWorldMatrix(true, false)
          after.push({ id: root.userData.pandauiObjectId, matrix: root.matrixWorld.toArray(), hidden: !!root.userData.pandauiHidden, kind: root.userData.geometryType })
        }
      })
      after.sort((a, b) => a.id.localeCompare(b.id))
      requireValue(JSON.stringify(before) === JSON.stringify(after), 'Instance transforms/hidden state changed: ' + JSON.stringify({ before, after }))
      const original = await restored.loadLocalGeometry(sourceId), edit = await restored.loadLocalGeometryEdit(selectedId)
      requireValue(original.geometry.data === archive.geometry.data && edit.geometry.data === archive.geometry.data, 'Native geometry or placement edit changed')
      const native = app.getNodeC().CommonObject.decode(original.geometry)
      requireValue(native.isValid && native instanceof app.getNodeC().Brep, 'Original geometry did not round trip as a Brep'); native.delete()
      let matches = 0
      restored.three.middleground.traverse(part => { const color = part.userData.displayMaterials?.render?.color; if (color && Math.abs(color.r - 0.15) < 1e-8 && Math.abs(color.g - 0.35) < 1e-8 && Math.abs(color.b - 0.65) < 1e-8) matches++ })
      requireValue(!material || matches > 0, 'Editable material color did not round trip')
      window.PandaUISceneWorkspace?.notify(true)
      const ref = { documentId, localDocument: true, localObjectId: selectedId, geometryId: selectedId }
      requireValue(app.getDisplayPipeline().documentTreeObjects(ref).length === 1, 'Local tree object lookup failed')
      requireValue(app.getDisplayPipeline().selectDocumentTreeItem(ref), 'Restored object cannot be selected')
      app.getDisplayPipeline().setDocumentTreeVisibility(ref, false)
      requireValue(app.getDisplayPipeline().documentTreeObjects(ref)[0].visible === false, 'Local tree hide failed')
      app.getDisplayPipeline().setDocumentTreeVisibility(ref, true)
      requireValue(app.getDisplayPipeline().documentTreeObjects(ref)[0].visible === true, 'Local tree show failed')
      const remeshed = await app.remeshDocument(restored, 0.8)
      requireValue(remeshed.updated > 0 && remeshed.failures.length === 0, 'Lazy geometry remesh failed: ' + JSON.stringify(remeshed))
      await app.saveLocalDocumentFolder(documentId, { directory })
      window.folderTestId = documentId
      document.querySelector('#editorFrame').contentWindow.PandaUIOpenPanelNode('DOCUMENT')
      return { elapsedMs, objectCount: before.length, sources: restored.localGeometryRefs.size, stages: stages.length, sequence: second.sequence, materialMatches: matches, renderMatches }
    })
    console.log('LOCAL_FOLDER_RESULT', JSON.stringify(report.folder))
    await page.waitForFunction(() => [...document.querySelectorAll('.document-manager__label')].some(label => label.textContent.includes('folder-source.step')))
    assert(await page.getByRole('button', { name: 'Save locally', exact: true }).first().isEnabled(), 'Offline local save command must be enabled')
    await page.evaluate(async () => {
      const app = window.testApp, m = app.getNodeC(), model = new m.File3dm(), objects = model.objects(), attrs = new m.ObjectAttributes()
      const box = new m.BoundingBox([0,0,0],[10,20,30]), brep = m.Brep.createFromBoundingBox(box)
      const id = objects.add(brep, attrs), bytes = model.toByteArray()
      brep.delete(); box.delete(); attrs.delete()
      for (let prototype = Object.getPrototypeOf(objects); prototype; prototype = Object.getPrototypeOf(prototype)) {
        if (Object.prototype.hasOwnProperty.call(prototype, 'isDeleted') && Object.prototype.hasOwnProperty.call(prototype, 'delete')) { prototype.delete.call(objects); break }
      }
      model.delete()
      // Independent native 3DM, no importedGeometrySources archive map.
      await app.openLocalFile(new File([bytes], 'folder-native.3dm'), 'import')
      const doc = app.modelDocuments().at(-1)
      const directory = await (await navigator.storage.getDirectory()).getDirectoryHandle('native-folder-' + crypto.randomUUID(), { create: true })
      await app.saveLocalDocumentFolder(doc.documentId, { directory })
      app.removeSceneDocuments([doc.documentId])
      const restored = await app.openLocalDocumentFolder({ directory })
      const source = await restored.loadLocalGeometry(id)
      if (!source?.geometry || !source?.attributes || !restored.importedGeometryHeader) throw new Error('Native 3DM original geometry/attributes/header missing')
      const geometry = m.CommonObject.decode(source.geometry)
      if (!(geometry instanceof m.Brep) || !geometry.isValid) throw new Error('Native 3DM restored as invalid geometry')
      geometry.delete()
      const result = await app.remeshDocument(restored, 0.8)
      if (!result.updated || result.failures.length) throw new Error('3DM lazy remesh failed: ' + JSON.stringify(result))
    })
    console.log('PASS native 3DM folder archive and lazy remesh')
    await page.evaluate(async () => {
      const app = window.testApp
      await app.openLocalFile(new File(['o Triangle\nv 0 0 0\nv 10 0 0\nv 0 10 0\nf 1 2 3\n'], 'folder-mesh.obj'), 'import')
      const doc = app.modelDocuments().at(-1)
      const positions = model => {
        const result = []
        model.three.middleground.traverse(root => {
          if (root.isMesh && !root.userData.renderBatch) result.push(Array.from(root.geometry.attributes.position.array))
        })
        return result
      }
      const before = positions(doc)
      if (!before.length) throw new Error('Missing OBJ fixture geometry')
      const directory = await (await navigator.storage.getDirectory()).getDirectoryHandle('mesh-folder-' + crypto.randomUUID(), { create: true })
      await app.saveLocalDocumentFolder(doc.documentId, { directory })
      app.removeSceneDocuments([doc.documentId])
      const restored = await app.openLocalDocumentFolder({ directory })
      if (JSON.stringify(positions(restored)) !== JSON.stringify(before)) throw new Error('Mesh buffer geometry changed on reopen')
      await app.saveLocalDocumentFolder(restored.documentId, { directory })
      const empty = await app.createLocalPrivateDocument('Empty document')
      const emptyFolder = await (await navigator.storage.getDirectory()).getDirectoryHandle('empty-folder-' + crypto.randomUUID(), { create: true })
      await app.saveLocalDocumentFolder(empty.documentId, { directory: emptyFolder })
      app.removeSceneDocuments([empty.documentId])
      const reopened = await app.openLocalDocumentFolder({ directory: emptyFolder })
      if (positions(reopened).length) throw new Error('Empty private document acquired model objects')
    })
    console.log('PASS OBJ buffer geometry, repeated save and empty private folder')
} }).catch(error => { console.error(error); process.exitCode = 1 })
