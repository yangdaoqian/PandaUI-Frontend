#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

const MANIFEST = 'docs/EXPORT_MANIFEST.json'
const CHANGELOG = 'docs/FRONTEND_CHANGELOG.md'
const LOCK = 'docs/.frontend-sync.lock'
const TREES = ['src/', 'public/editor/', 'public/nodec/', 'public/shared/']
// Changes to this list require review; a manifest entry is not permission to export.
const EXTRA_FILES = new Set([
  'scripts/backend-dev-proxy.js',
  'scripts/SceneFileWebpack.js',
  'scripts/editor-test-kernel.js',
  'scripts/test-editor-pandaui-runtime.js',
  'scripts/test-graph-operations.js',
  'scripts/sync-frontend-import-assets.js',
  'scripts/sync-frontend-export.cjs',
  'scripts/test-sync-frontend-export.cjs',
  'scripts/test-imported-material-editor.js',
  'scripts/test-render-raster-browser.js',
  'scripts/test-render-raster-fixture.js',
  'scripts/test-render-idle-loop.cjs',
  'scripts/test-viewport-display-settings.js',
  'docs/RENDER_MATERIAL_FIXES.md',
  'docs/PATH_TRACER_MIGRATION.md',
  'scripts/build-pathtracer-runtime.cjs',
  'scripts/pathtracer-runtime/runtime.js',
  'scripts/pathtracer-runtime/package.json',
  'scripts/pathtracer-runtime/package-lock.json',
  'scripts/pathtracer-runtime/glslSmartDeNoise-LICENSE.txt',
  'scripts/test-pathtracer-runtime-browser.cjs',
  'scripts/test-pathtrace-scene-materials.cjs',
  'scripts/test-render-pathtrace.js',
  'scripts/test-render-pathtrace-browser.js',
  'scripts/test-render-scene-adapter.js',
  'scripts/test-render-nodes.js',
  'scripts/test-step-part21.cjs',
  'scripts/test-step-progressive.cjs',
  'scripts/test-step-progressive-browser.cjs',
  'scripts/test-folder-document-store.cjs',
  'scripts/test-local-document-folder-browser.cjs',
  'scripts/test-step-native.cjs',
  'scripts/test-step-brep.cjs',
  'scripts/test-step-opennurbs.cjs',
  'scripts/test-step-instances.cjs',
  'scripts/test-cad-frontend-import.js',
  'scripts/test-node-packages.cjs',
  'scripts/test-node-packages-browser.cjs',
  'scripts/test-mesh-worker-pool.js',
  'docs/BREP_MESHING.md',
  'docs/WASM_NODE_PACKAGES.md',
  'scripts/build-skp-runtime.cjs',
  'scripts/test-skp-import.cjs',
  'scripts/test-skp-browser.cjs',
  'docs/SKP_IMPORT.md',
  'docs/STEP_IMPORT.md',
  'docs/LOCAL_DOCUMENT_STORAGE.md',
  'docs/FRONTEND_SYNC.md',
  'AGENTS.md'
])
const ADAPTED = new Set([
  'src/App.vue', 'quasar.conf.js', 'quasar.config.js', 'quasar.config.ts',
  'package.json', 'package-lock.json', 'yarn.lock',
  'scripts/sync-frontend-import-assets.js', 'AGENTS.md'
])
const EXCLUDED = [
  'public/editor/imgs', 'public/editor/nodes_data', 'public/editor/plugins/data',
  'public/nodec/placeholders', 'public/nodec/GraphNodePlaceholders.js'
]
const HASH = /^[a-f0-9]{64}$/i
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0
const sha256 = data => crypto.createHash('sha256').update(data).digest('hex')
const fail = message => { throw new Error(message) }

function relativePath (value) {
  if (typeof value !== 'string' || !value || /[\x00-\x1f\x7f<>:"|?*]/.test(value)) {
    fail(`Invalid relative path: ${JSON.stringify(value)}`)
  }
  const name = value.replace(/\\/g, '/')
  if (path.posix.isAbsolute(name) || name.split('/').some(part =>
    !part || part === '.' || part === '..' || /[. ]$/.test(part) ||
    /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part))) {
    fail(`Invalid relative path: ${value}`)
  }
  return name
}

function stat (file) {
  try { return fs.lstatSync(file) } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
}

// Inspect every ancestor, including root ancestors, so junctions and dangling
// symlinks cannot redirect reads, directory creation, or atomic replacements.
function safePath (root, name = '') {
  const resolved = path.resolve(root, name)
  const relative = path.relative(root, resolved)
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    fail(`Path escapes root: ${name}`)
  }
  const parsed = path.parse(resolved)
  let current = parsed.root
  const parts = resolved.slice(parsed.root.length).split(path.sep).filter(Boolean)
  for (let i = 0; i < parts.length; i++) {
    const parent = current
    current = path.join(parent, parts[i])
    const info = stat(current)
    if (!info) break
    if (info.isSymbolicLink()) fail(`Symlink/junction refused: ${current}`)
    if (i < parts.length - 1 && !info.isDirectory()) fail(`Not a directory: ${current}`)
    // Prevent case aliases even on case-insensitive filesystems.
    if (current.length > root.length && !fs.readdirSync(parent).includes(parts[i])) {
      fail(`Path spelling/case does not match disk: ${current}`)
    }
  }
  return resolved
}

function readFile (root, name, required = false) {
  const file = safePath(root, name)
  const info = stat(file)
  if (!info) {
    if (required) fail(`Missing file: ${file}`)
    return null
  }
  if (!info.isFile()) fail(`Expected a regular file: ${file}`)
  return fs.readFileSync(file)
}

function allowed (name, exclusions) {
  const lower = name.toLowerCase()
  const parts = lower.split('/')
  const blockedSegment = /^(?:server|backend|native|native[-_]source|plugins_main|node_modules|\.git|\.tools|\.tmp|dist|build|bin|obj|models?|samples?|catalogs?|nodes_data|decompiled(?:[-_].*)?|decompilation)$/
  const blockedExtension = /\.(?:dll|exe|pdb|so|dylib|a|lib|o|obj|c|cc|cpp|cxx|h|hh|hpp|hxx|cs|csproj|sln|vcxproj|3dm|step|stp|iges|igs|stl|fbx|skp|blend|gltf|glb|ply|off|onnx|pt|pth|zip|7z|rar)$/
  if (parts.some(part => blockedSegment.test(part) || part.startsWith('.env')) ||
      blockedExtension.test(lower) || /(?:catalog|decompiled)/i.test(name) ||
      exclusions.some(item => lower === item.toLowerCase() || lower.startsWith(item.toLowerCase() + '/'))) {
    fail(`Blacklisted export path: ${name}`)
  }
  if (!TREES.some(prefix => name.startsWith(prefix)) && !EXTRA_FILES.has(name) && !ADAPTED.has(name)) {
    fail(`Path is not in the export allowlist: ${name}`)
  }
}

function readManifest (bytes) {
  let manifest
  try { manifest = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, '')) } catch {
    fail('Invalid JSON in export manifest')
  }
  if (!manifest || !Array.isArray(manifest.copied)) fail('Manifest must contain a copied array')
  const bySource = new Map()
  const destinations = new Set()
  for (const entry of manifest.copied) {
    if (!entry || typeof entry !== 'object') fail('Invalid manifest entry')
    const source = relativePath(entry.source)
    const destination = relativePath(entry.destination)
    if (source !== entry.source || destination !== entry.destination ||
        !HASH.test(entry.sourceSha256) || !HASH.test(entry.exportSha256) ||
        !Number.isSafeInteger(entry.bytes) || entry.bytes < 0) fail(`Invalid manifest entry: ${source}`)
    if (bySource.has(source.toLowerCase()) || destinations.has(destination.toLowerCase())) {
      fail(`Duplicate/aliased manifest entry: ${source}`)
    }
    bySource.set(source.toLowerCase(), entry)
    destinations.add(destination.toLowerCase())
  }
  for (const field of ['adaptations', 'excludedWithinAllowedTrees']) {
    if (manifest[field] !== undefined && !Array.isArray(manifest[field])) fail(`Invalid manifest ${field}`)
    for (const name of manifest[field] || []) relativePath(name)
  }
  return { manifest, bySource }
}

function markdown (value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\|/g, '&#124;').replace(/`/g, '&#96;').replace(/\r?\n/g, '<br>')
}

function makePlan ({ sourceRoot, targetRoot, paths, message, allowAdapted = false }) {
  if (typeof message !== 'string' || !message.trim() || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(message)) {
    fail('A nonempty --message is required')
  }
  if (!Array.isArray(paths) || !paths.length) fail('At least one explicit relative file path is required')
  sourceRoot = path.resolve(sourceRoot)
  targetRoot = path.resolve(targetRoot)
  for (const root of [sourceRoot, targetRoot]) {
    safePath(root)
    if (!stat(root)?.isDirectory()) fail(`Missing repository directory: ${root}`)
  }
  const sourceKey = sourceRoot.toLowerCase() + path.sep
  const targetKey = targetRoot.toLowerCase() + path.sep
  if (sourceKey.startsWith(targetKey) || targetKey.startsWith(sourceKey)) fail('Repository roots must be disjoint')
  const selected = new Map()
  for (const value of paths) {
    const name = relativePath(value)
    const key = name.toLowerCase()
    if (selected.has(key) && selected.get(key) !== name) fail(`Aliased selection: ${name}`)
    selected.set(key, name)
  }
  const names = [...selected.values()].sort(compare)
  const manifestBytes = readFile(targetRoot, MANIFEST, true)
  const { manifest, bySource } = readManifest(manifestBytes)
  const exclusions = [...EXCLUDED, ...(manifest.excludedWithinAllowedTrees || [])]
  for (const name of names) allowed(name, exclusions)
  const adaptedNames = new Set([...ADAPTED, ...(manifest.adaptations || [])].map(name => name.toLowerCase()))
  const sourceLog = readFile(sourceRoot, CHANGELOG)
  const targetLog = readFile(targetRoot, CHANGELOG)
  if (sourceLog === null ? targetLog !== null : targetLog === null || !sourceLog.equals(targetLog)) {
    fail('Change log conflict: both repositories must have identical logs (or both be absent)')
  }
  if (manifest.frontendSync !== undefined &&
      (!manifest.frontendSync || !HASH.test(manifest.frontendSync.changeLogSha256) ||
       !sourceLog || sha256(sourceLog) !== manifest.frontendSync.changeLogSha256)) {
    fail('Change log conflict: content does not match the recorded hash')
  }
  const lockFile = safePath(targetRoot, LOCK)
  if (stat(lockFile)) fail(`Sync lock exists: ${lockFile}; inspect the prior run before removing it`)
  const changes = []
  const snapshots = [
    { root: targetRoot, name: MANIFEST, before: manifestBytes },
    { root: sourceRoot, name: CHANGELOG, before: sourceLog },
    { root: targetRoot, name: CHANGELOG, before: targetLog }
  ]
  for (const name of names) {
    const entry = bySource.get(name.toLowerCase())
    if (entry && (entry.source !== name || entry.destination !== name)) fail(`Non-identity manifest mapping: ${name}`)
    if (manifest.copied.some(item => item.destination.toLowerCase() === name.toLowerCase() && item !== entry)) {
      fail(`Manifest destination already owned: ${name}`)
    }
    const adapted = adaptedNames.has(name.toLowerCase()) ||
      (entry && entry.sourceSha256.toLowerCase() !== entry.exportSha256.toLowerCase())
    if (adapted && !allowAdapted) fail(`Frontend adaptation protected: ${name}; requires --allow-adapted`)
    const data = readFile(sourceRoot, name, true)
    const before = readFile(targetRoot, name)
    const sourceHash = sha256(data)
    const beforeHash = before === null ? null : sha256(before)
    if (entry && beforeHash !== entry.exportSha256.toLowerCase()) {
      fail(`Target conflict: ${name}; expected ${entry.exportSha256}, found ${beforeHash || 'missing'}`)
    }
    if (!entry && before !== null && !(adapted && allowAdapted)) {
      fail(`Untracked target conflict: ${name}; no recorded export hash`)
    }
    snapshots.push({ root: sourceRoot, name, before: data }, { root: targetRoot, name, before })
    if (entry && entry.sourceSha256.toLowerCase() === sourceHash && beforeHash === sourceHash) continue
    changes.push({ name, data, before, sourceHash, beforeHash, previousSourceHash: entry?.sourceSha256 || null, adapted: !!adapted })
    const updated = { ...entry, source: name, destination: name, bytes: data.length, sourceSha256: sourceHash, exportSha256: sourceHash }
    if (entry) manifest.copied[manifest.copied.indexOf(entry)] = updated
    else manifest.copied.push(updated)
  }
  if (!changes.length) return { changes, writes: [], snapshots, sourceRoot, targetRoot }
  manifest.copied.sort((a, b) => compare(a.destination, b.destination))
  const previousLogHash = sourceLog ? sha256(sourceLog) : null
  const changeId = sha256(JSON.stringify({ previousLogHash, message: message.trim(), files: changes.map(item => ({
    path: item.name, before: item.beforeHash, previousSource: item.previousSourceHash, after: item.sourceHash, adapted: item.adapted
  })) }))
  let log = sourceLog ? sourceLog.toString('utf8') : '# Frontend change log\n\nAll hashes are SHA-256. Entries are ordered by successful synchronization.\n'
  log += `\n## ${changeId}\n\nMessage: ${markdown(message.trim())}\n\n`
  log += '| File | Previous source | Previous export (actual) | Source SHA-256 | Export SHA-256 | Adapted override |\n'
  log += '| --- | --- | --- | --- | --- | --- |\n'
  for (const item of changes) {
    log += `| ${markdown(item.name)} | ${item.previousSourceHash || 'absent'} | ${item.beforeHash || 'absent'} | ${item.sourceHash} | ${item.sourceHash} | ${item.adapted ? 'yes' : 'no'} |\n`
  }
  const logBytes = Buffer.from(log, 'utf8')
  manifest.frontendSync = { ...manifest.frontendSync, lastChangeId: changeId, changeLogSha256: sha256(logBytes) }
  const writes = changes.filter(item => item.before === null || !item.data.equals(item.before))
    .map(item => ({ root: targetRoot, name: item.name, before: item.before, data: item.data }))
  writes.push(
    { root: sourceRoot, name: CHANGELOG, before: sourceLog, data: logBytes },
    { root: targetRoot, name: CHANGELOG, before: targetLog, data: logBytes },
    { root: targetRoot, name: MANIFEST, before: manifestBytes, data: Buffer.from(JSON.stringify(manifest, null, 2) + '\n') }
  )
  return { changes, writes, snapshots, sourceRoot, targetRoot }
}

function verifySnapshots (snapshots) {
  for (const item of snapshots) {
    const now = readFile(item.root, item.name)
    if (item.before === null ? now !== null : now === null || !now.equals(item.before)) {
      fail(`File changed during sync: ${item.name}`)
    }
  }
}

// Every replacement uses a sibling temporary file and rename. Stage all bytes
// first; roll back completed replacements on ordinary I/O errors. This is not
// a crash-atomic transaction across two repositories/filesystems.
function commit (plan) {
  verifySnapshots(plan.snapshots)
  const lockFile = safePath(plan.targetRoot, LOCK)
  const lock = fs.openSync(lockFile, 'wx')
  const staged = []
  const committed = []
  const directories = []
  function ensureDirectory (root, directory) {
    if (stat(directory)) return
    ensureDirectory(root, path.dirname(directory))
    safePath(root, path.relative(root, directory))
    fs.mkdirSync(directory)
    directories.push(directory)
  }
  function stage (root, name, data) {
    const file = safePath(root, name)
    ensureDirectory(root, path.dirname(file))
    const temp = file + `.frontend-sync-${crypto.randomBytes(12).toString('hex')}.tmp`
    staged.push(temp)
    const fd = fs.openSync(temp, 'wx', stat(file)?.mode ?? 0o666)
    try { fs.writeFileSync(fd, data); fs.fsyncSync(fd) } finally { fs.closeSync(fd) }
    return temp
  }
  let preserveLock = false
  try {
    fs.writeFileSync(lock, `${process.pid}\n`)
    verifySnapshots(plan.snapshots)
    const replacements = plan.writes.map(item => ({ ...item, temp: stage(item.root, item.name, item.data) }))
    verifySnapshots(plan.snapshots)
    for (const item of replacements) {
      verifySnapshots([item])
      fs.renameSync(item.temp, safePath(item.root, item.name))
      committed.push(item)
    }
  } catch (error) {
    const recovery = []
    for (const item of committed.reverse()) {
      try {
        const now = readFile(item.root, item.name, true)
        if (!now.equals(item.data)) fail(`Concurrent edit prevents rollback: ${item.name}`)
        const file = safePath(item.root, item.name)
        if (item.before === null) fs.unlinkSync(file)
        else fs.renameSync(stage(item.root, item.name, item.before), file)
      } catch (rollbackError) { recovery.push(rollbackError.message) }
    }
    preserveLock = recovery.length > 0
    if (recovery.length) fail(`${error.message}; rollback incomplete; lock retained: ${recovery.join('; ')}`)
    throw error
  } finally {
    fs.closeSync(lock)
    for (const temp of staged) { if (stat(temp)) fs.unlinkSync(temp) }
    for (const directory of directories.reverse()) {
      try { fs.rmdirSync(directory) } catch (error) { if (!['ENOTEMPTY', 'EEXIST'].includes(error.code)) throw error }
    }
    if (!preserveLock) fs.unlinkSync(lockFile)
  }
}

function syncFrontendExport (options) {
  const sourceRoot = options.sourceRoot || path.resolve(__dirname, '..')
  const targetRoot = options.targetRoot || path.resolve(sourceRoot, '..', 'PandaUI-Frontend')
  const plan = makePlan({ ...options, sourceRoot, targetRoot })
  if (!options.check && plan.changes.length) commit(plan)
  return {
    status: plan.changes.length ? (options.check ? 'pending' : 'synced') : 'unchanged',
    files: plan.changes.map(item => ({ path: item.name, previousExportSha256: item.beforeHash, sourceSha256: item.sourceHash, exportSha256: item.sourceHash }))
  }
}

const USAGE = `Usage: node scripts/sync-frontend-export.cjs --message "reason" [--check] [--allow-adapted] [--] <relative-file>...\n\nSource: script's repository. Target: sibling PandaUI-Frontend.\nExact files only; no directories, globs, deletes, or Git operations.\nExit codes: 0 synced/unchanged; 1 invalid/conflict/I/O error; 2 --check has pending changes.\n`

function main (args) {
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) { process.stdout.write(USAGE); return 0 }
  const options = { paths: [] }
  let literal = false
  const flags = new Set()
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (!literal && arg === '--') { literal = true; continue }
    if (!literal && arg.startsWith('-')) {
      if (!['--message', '--check', '--allow-adapted'].includes(arg) || flags.has(arg)) fail(`Unknown or repeated option: ${arg}`)
      flags.add(arg)
      if (arg === '--message') {
        const value = args[++i]
        if (!value || value.startsWith('--')) fail('Missing --message value')
        options.message = value
      } else options[arg === '--check' ? 'check' : 'allowAdapted'] = true
    } else options.paths.push(arg)
  }
  const result = syncFrontendExport(options)
  process.stdout.write(JSON.stringify(result, null, 2) + '\n')
  return result.status === 'pending' ? 2 : 0
}

module.exports = { syncFrontendExport }
if (require.main === module) {
  try { process.exitCode = main(process.argv.slice(2)) } catch (error) {
    process.stderr.write(`Frontend sync refused: ${error.message}\n`)
    process.exitCode = 1
  }
}
