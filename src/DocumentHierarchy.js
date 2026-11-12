export function ownsWorkspaceDocument (document, workspace) {
  return document.owned ?? Boolean((workspace.userId && document.ownerUserId === workspace.userId) || (workspace.ownerId && document.ownerId === workspace.ownerId))
}

export function visibleWorkspaceDocuments (workspace) {
  return (workspace.documents || []).filter(document => document.publicDocumentId === workspace.publicDocumentId && (document.publishedAt || (ownsWorkspaceDocument(document, workspace) && (workspace.openedPrivateDocumentIds || []).includes(document.documentId))))
}

export function workspaceObjectLoaded (object, workspace) {
  if (!object) return false
  const document = (workspace.documents || []).find(entry => entry.documentId === object.privateDocumentId)
  // Foreign drafts remain shared read-only displays. An account's saved drafts
  // are loaded into this window only by an explicit open, import or create.
  return object.publicationState === 'published' || Boolean(document?.publishedAt) ||
    !ownsWorkspaceDocument(document || object, workspace) || (workspace.openedPrivateDocumentIds || []).includes(object.privateDocumentId)
}

export function sharedSceneDocument (workspace) {
  if (!workspace.publicDocumentId) return null
  const listed = new Set(visibleWorkspaceDocuments(workspace).map(document => document.documentId))
  const objects = (workspace.sceneObjects || []).filter(object => workspaceObjectLoaded(object, workspace) && !listed.has(object.privateDocumentId))
  if (!objects.length) return null
  // Display already-shared geometry without exposing another owner's private
  // document entry or treating a draft as published.
  return { documentId: workspace.publicDocumentId, treeKey: 'scene:shared', name: objects.every(object => object.publicationState === 'draft') ? 'Shared drafts (read-only)' : 'Shared objects', displayOnly: true, sceneObjects: objects }
}

export function documentHierarchy ({ documents, workspace, pages, expanded, geometryRow, nodeTitle }) {
  const result = []
  const native = new Map(documents.map(document => [document.documentId, document]))
  const children = visibleWorkspaceDocuments(workspace)
  const publicDocument = (workspace.documents || []).find(document => document.documentId === workspace.publicDocumentId)
  const addDocument = entry => {
    const document = { ...entry, ...(!entry.displayOnly && native.get(entry.nativeDocumentId || entry.documentId)) }
    const key = entry.treeKey || 'document:' + entry.documentId
    const writable = !entry.displayOnly && ownsWorkspaceDocument(entry, workspace) && !entry.publishedAt && entry.role !== 'viewer'
    const page = entry.displayOnly ? null : pages[document.documentId]
    const shared = entry.sceneObjects || (workspace.sceneObjects || []).filter(object => object.privateDocumentId === entry.documentId)
    const byGeometry = new Map(shared.filter(object => object.geometryId).map(object => [object.geometryId, object]))
    const represented = new Set()
    const items = (page?.items || []).map(item => {
      const object = byGeometry.get(item.geometryId)
      if (!object || object.nativeDocumentId !== document.documentId || (item.poolGeneration && object.poolGeneration !== item.poolGeneration)) return item
      represented.add(object.objectId)
      return { ...item, sharedObjectId: object.objectId, ownerUsername: object.ownerUsername, ownerUserId: object.ownerUserId, ownerId: object.ownerId, editable: object.editable, visible: object.visible, layerPath: object.layerPath || item.layerPath }
    })
    // A native document summary alone does not mean its object page is loaded.
    const displays = shared.filter(object => !represented.has(object.objectId))
    const ownerNames = [...new Set(shared.map(object => object.ownerUsername).filter(Boolean))]
    const ownerUsername = !entry.publishedAt ? entry.ownerUsername || (entry.displayOnly && ownerNames.length === 1 ? ownerNames[0] : null) : null
    const root = { ...document, ownerUsername, ownerId: entry.publishedAt ? null : document.ownerId, workspaceDocumentId: entry.documentId, writable, deletable: !entry.displayOnly && (entry.canDelete ?? ownsWorkspaceDocument(entry, workspace)), key, depth: 1, label: entry.name || document.name, branch: true, group: entry.displayOnly === true, icon: entry.publishedAt ? 'cloud_done' : writable ? 'folder_open' : 'lock', count: Math.max(document.objectCount || 0, items.length + displays.length, workspace.objectCounts?.[entry.documentId] || 0), document }
    result.push(root)
    if (!expanded.has(key)) return
    const layers = new Map()
    const layer = path => {
      if (layers.has(path)) return layers.get(path)
      const parts = path.split('::')
      const label = parts.pop()
      const parent = parts.length ? layer(parts.join('::')) : null
      const row = { documentId: document.documentId, document, workspaceDocumentId: entry.documentId, writable, layerPath: path, key: key + ':layer:' + path, depth: parent ? parent.depth + 1 : 2, label, branch: true, group: true, icon: 'layers', children: [], objects: [] }
      layers.set(path, row)
      parent?.children.push(row)
      return row
    }
    ;(document.layers || []).forEach(layer)
    const displayItem = object => ({ documentId: document.documentId, sharedObjectId: object.objectId, name: object.name, revision: object.revision, nativeDocumentId: object.nativeDocumentId, geometryId: object.geometryId, poolGeneration: object.poolGeneration, ownerId: object.ownerId, ownerUserId: object.ownerUserId, ownerUsername: object.ownerUsername, editable: object.editable, visible: object.visible, geometryType: 'Display', layerPath: object.layerPath || '' })
    // A client that did not import the source native document locally still
    // receives the shared object's layer path in the collaboration snapshot.
    // Recreate those layers here so the public document keeps its hierarchy.
    displays.filter(object => object.layerPath).forEach(object => layer(object.layerPath).objects.push(displayItem(object)))
    const groups = new Map()
    const unlayeredDisplays = displays.filter(object => !object.layerPath)
    if (unlayeredDisplays.length) groups.set('display', { documentId: document.documentId, document, workspaceDocumentId: entry.documentId, writable: writable && unlayeredDisplays.every(object => !object.nativeDocumentId), key: key + ':display', depth: 2, label: 'Scene objects', branch: true, group: true, displayOnly: true, icon: 'view_in_ar', children: [], objects: unlayeredDisplays.map(displayItem) })
    for (const item of items) {
      const origin = item.origin || {}
      if (origin.kind === 'nodeOutput') {
        const id = String(origin.nodeInstanceId || 'unknown')
        if (!groups.has(id)) groups.set(id, { documentId: document.documentId, document, workspaceDocumentId: entry.documentId, writable, key: key + ':node:' + id, depth: 2, label: nodeTitle(id), branch: true, group: true, icon: 'hub', originKind: 'nodeOutput', nodeInstanceId: id, children: [], objects: [] })
        groups.get(id).objects.push(item)
      } else layer(item.layerPath || 'Default').objects.push(item)
    }
    const addGroup = group => {
      const count = branch => branch.objects.length + branch.children.reduce((total, child) => total + count(child), 0)
      result.push({ ...group, count: count(group) })
      if (!expanded.has(group.key)) return
      group.children.forEach(addGroup)
      group.objects.forEach(item => result.push({ ...geometryRow(item), ownerUsername: item.ownerUsername || (!entry.publishedAt ? entry.ownerUsername : null), ownerId: item.ownerId || (!entry.publishedAt ? entry.ownerId : null), workspaceDocumentId: entry.documentId, writable: writable && (!item.sharedObjectId || !item.nativeDocumentId), document, depth: group.depth + 1 }))
    }
    ;[...layers.values()].filter(row => row.depth === 2).forEach(addGroup)
    groups.forEach(addGroup)
    if (!layers.size && !groups.size) result.push({ key: key + ':empty', depth: 2, label: page?.loading ? 'Loading...' : 'No objects', message: true, loading: page?.loading, icon: 'inventory_2' })
    if (page?.hasMore) result.push({ key: key + ':more', depth: 2, label: items.length + ' / ' + page.total, message: true, more: true, document, icon: 'more_horiz', loading: page.loading })
  }
  result.push({ key: 'scene:public', depth: 0, label: publicDocument?.name || 'Public document', documentId: publicDocument?.documentId, workspaceDocumentId: publicDocument?.documentId, kind: 'public', deletable: publicDocument?.canDelete ?? (!!workspace.ownerId && publicDocument?.ownerId === workspace.ownerId), branch: true, icon: 'public', section: true, count: (workspace.sceneObjects || []).length })
  if (expanded.has('scene:public')) {
    children.filter(entry => entry.publishedAt).forEach(addDocument)
    const shared = sharedSceneDocument(workspace)
    if (shared) addDocument(shared)
  }
  result.push({ key: 'scene:private', depth: 0, label: 'Private documents', branch: true, icon: 'folder_shared', section: true })
  if (expanded.has('scene:private')) {
    const opened = children.filter(entry => !entry.publishedAt)
    opened.forEach(addDocument)
    if (!opened.length) result.push({ key: 'scene:private:empty', depth: 1, label: 'Open, import or create a private document', message: true, icon: 'folder_open' })
  }
  return result
}

export function documentMovePayload (source, target, poolGeneration) {
  if (!source?.writable || !target?.writable || source.message || target.message || target.geometryId || target.sharedObjectId || (target.group && !target.layerPath)) return null
  if (source.key === target.key) return null
  if (source.documentId === target.documentId && (!target.layerPath || (!source.geometryId && !source.group))) return null
  if (source.documentId === target.documentId && source.layerPath && (target.layerPath === source.layerPath || target.layerPath.startsWith(source.layerPath + '::'))) return null
  const displays = source.sharedObjectId ? [source] : source.displayOnly ? source.objects : null
  if (displays && target.layerPath) return null
  const selector = displays ? { kind: 'display', objects: displays.map(object => ({ objectId: object.sharedObjectId, revision: object.revision })) } : source.geometryId ? { kind: 'object', geometryId: source.geometryId } : source.layerPath ? { kind: 'layer', layerPath: source.layerPath } : source.group ? { kind: 'group', originKind: source.originKind, nodeInstanceId: source.nodeInstanceId } : { kind: 'document' }
  return { privateDocumentId: source.workspaceDocumentId, targetDocumentId: target.workspaceDocumentId, poolGeneration, sourceRevision: source.document.revision, targetRevision: target.document.revision || 0, selector, targetLayerPath: target.layerPath || null }
}
