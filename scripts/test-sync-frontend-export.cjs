#!/usr/bin/env node
'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')
const { spawnSync } = require('node:child_process')
const { test } = require('node:test')
const { syncFrontendExport } = require('./sync-frontend-export.cjs')

const MANIFEST = 'docs/EXPORT_MANIFEST.json'
const LOG = 'docs/FRONTEND_CHANGELOG.md'
const hash = value => crypto.createHash('sha256').update(value).digest('hex')
function put (root, name, content) {
  const file = path.join(root, name)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, content)
}
function fixture (t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'pandaui-export-test-'))
  // Delete only the exact directory returned by mkdtemp, never a user repository.
  t.after(() => fs.rmSync(base, { recursive: true, force: true }))
  const sourceRoot = path.join(base, 'PandaUI')
  const targetRoot = path.join(base, 'PandaUI-Frontend')
  fs.mkdirSync(sourceRoot)
  fs.mkdirSync(targetRoot)
  const manifest = { exportedOn: '2026-11-12', status: 'keep-me', copied: [], adaptations: [], other: { retained: true } }
  const save = () => put(targetRoot, MANIFEST, JSON.stringify(manifest, null, 2) + '\n')
  save()
  return {
    base, sourceRoot, targetRoot, manifest, save,
    add (name, source = 'new', exported = 'old', sourceAtExport = exported) {
      put(sourceRoot, name, source)
      put(targetRoot, name, exported)
      manifest.copied.push({ source: name, destination: name, bytes: Buffer.byteLength(exported), sourceSha256: hash(sourceAtExport), exportSha256: hash(exported) })
      save()
    },
    run (paths = ['src/file.js'], options = {}) {
      return syncFrontendExport({ sourceRoot, targetRoot, paths, message: 'Update frontend', ...options })
    },
    read (root, name) { return fs.readFileSync(path.join(root, name), 'utf8') }
  }
}
function snapshot (root) {
  const entries = []
  function walk (directory, prefix = '') {
    for (const name of fs.readdirSync(directory).sort()) {
      const file = path.join(directory, name)
      const relative = prefix + name
      const info = fs.lstatSync(file)
      if (info.isSymbolicLink()) entries.push([relative, 'link', fs.readlinkSync(file)])
      else if (info.isDirectory()) { entries.push([relative, 'dir']); walk(file, relative + '/') }
      else entries.push([relative, hash(fs.readFileSync(file)), info.mtimeMs])
    }
  }
  walk(root)
  return entries
}
function refusesWithoutWrites (f, action, pattern) {
  const before = snapshot(f.base)
  assert.throws(action, pattern)
  assert.deepEqual(snapshot(f.base), before)
}

test('selective sync updates hashes, preserves metadata and mirrors a log; rerun is a strict no-op', t => {
  const f = fixture(t)
  f.add('src/file.js')
  f.add('src/unselected.js', 'unselected new', 'unselected old')
  put(f.sourceRoot, 'public/nodec/NodeC.wasm', Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]))
  const paths = ['src/file.js', 'public/nodec/NodeC.wasm', 'src/file.js']
  const before = snapshot(f.base)
  assert.equal(f.run(paths, { check: true }).status, 'pending')
  assert.deepEqual(snapshot(f.base), before)
  const result = f.run(paths, { message: 'Fix | rendering\n<script>`code`' })
  assert.deepEqual(result.files.map(item => item.path), ['public/nodec/NodeC.wasm', 'src/file.js'])
  assert.equal(f.read(f.targetRoot, 'src/file.js'), 'new')
  assert.equal(f.read(f.targetRoot, 'src/unselected.js'), 'unselected old')
  const manifest = JSON.parse(f.read(f.targetRoot, MANIFEST))
  assert.equal(manifest.status, 'keep-me')
  assert.deepEqual(manifest.other, { retained: true })
  const entry = manifest.copied.find(item => item.source === 'src/file.js')
  assert.equal(entry.sourceSha256, hash('new'))
  assert.equal(entry.exportSha256, hash('new'))
  assert.equal(entry.bytes, 3)
  const log = f.read(f.sourceRoot, LOG)
  assert.equal(log, f.read(f.targetRoot, LOG))
  assert.ok(log.includes(hash('old')) && log.includes(hash('new')))
  assert.ok(log.includes('Fix &#124; rendering<br>&lt;script&gt;&#96;code&#96;'))
  assert.equal(manifest.frontendSync.changeLogSha256, hash(log))
  const after = snapshot(f.base)
  assert.equal(f.run(paths, { message: 'Different message, same bytes' }).status, 'unchanged')
  assert.equal(f.run(paths, { check: true }).status, 'unchanged')
  assert.deepEqual(snapshot(f.base), after)
  put(f.sourceRoot, 'src/file.js', 'newer')
  f.run()
  assert.equal((f.read(f.sourceRoot, LOG).match(/^## /gm) || []).length, 2)
  assert.equal(f.read(f.sourceRoot, LOG), f.read(f.targetRoot, LOG))
})

test('same inputs produce identical output regardless of selection order or wall clock', t => {
  const a = fixture(t)
  const b = fixture(t)
  for (const f of [a, b]) { f.add('src/z.js'); f.add('public/shared/a.js') }
  a.run(['src/z.js', 'public/shared/a.js'])
  b.run(['public/shared/a.js', 'src/z.js'])
  assert.equal(a.read(a.targetRoot, MANIFEST), b.read(b.targetRoot, MANIFEST))
  assert.equal(a.read(a.sourceRoot, LOG), b.read(b.sourceRoot, LOG))
})

test('target edits, deletions, and untracked collisions abort the whole batch', t => {
  for (const state of ['edited', 'deleted', 'untracked', 'already-source']) {
    const f = fixture(t)
    f.add('src/file.js')
    f.add('src/conflict.js')
    if (state === 'edited') put(f.targetRoot, 'src/conflict.js', 'user edits')
    if (state === 'already-source') put(f.targetRoot, 'src/conflict.js', 'new')
    if (state === 'deleted') fs.unlinkSync(path.join(f.targetRoot, 'src/conflict.js'))
    if (state === 'untracked') { f.manifest.copied.pop(); f.save() }
    refusesWithoutWrites(f, () => f.run(['src/file.js', 'src/conflict.js']), /conflict/i)
    refusesWithoutWrites(f, () => f.run(['src/file.js', 'src/conflict.js'], { allowAdapted: true, check: true }), /conflict/i)
  }
})

test('all named and manifest-derived adaptations need opt-in; opt-in does not waive tracked user edits', t => {
  for (const name of ['src/App.vue', 'quasar.conf.js', 'package.json', 'scripts/sync-frontend-import-assets.js', 'AGENTS.md', 'public/editor/index.html', 'src/custom.js']) {
    const f = fixture(t)
    f.add(name, 'original new', 'frontend version', 'original old')
    if (name === 'public/editor/index.html') { f.manifest.adaptations.push(name); f.save() }
    refusesWithoutWrites(f, () => f.run([name]), /adaptation protected/)
    f.run([name], { allowAdapted: true })
    assert.equal(f.read(f.targetRoot, name), 'original new')
    put(f.targetRoot, name, 'user edits')
    refusesWithoutWrites(f, () => f.run([name], { allowAdapted: true }), /conflict/)
  }
  const f = fixture(t)
  put(f.sourceRoot, 'package.json', '{"name":"original"}')
  put(f.targetRoot, 'package.json', '{"name":"frontend"}')
  refusesWithoutWrites(f, () => f.run(['package.json']), /adaptation protected/)
  f.run(['package.json'], { allowAdapted: true })
  assert.ok(f.read(f.sourceRoot, LOG).includes(hash('{"name":"frontend"}')))
})

test('adaptations list protects equal-hash files and export exclusions are enforced', t => {
  const f = fixture(t)
  f.add('src/file.js')
  f.manifest.adaptations.push('src/file.js')
  f.manifest.excludedWithinAllowedTrees = ['src/excluded']
  f.save()
  put(f.sourceRoot, 'src/excluded/a.js', 'secret')
  refusesWithoutWrites(f, () => f.run(), /adaptation protected/)
  refusesWithoutWrites(f, () => f.run(['src/excluded/a.js'], { allowAdapted: true }), /Blacklisted/)
})

test('blacklist wins over allowlist and --allow-adapted', t => {
  const f = fixture(t)
  f.add('src/file.js')
  const names = [
    'server/a.js', 'Plugins_Main/a.cs', 'public/vendor/a.js', 'scripts/unreviewed.js', 'docs/unreviewed.md',
    'docs/analysis/step-import/notes.md', 'docs/analysis/step-import.md',
    'src/native/a.js', 'src/backend/a.js', 'src/model/car.json', 'src/models/car.json',
    'public/editor/local-node-catalog.json', 'public/editor/nodes_data/a.json', 'public/editor/plugins/data/a.json',
    'public/nodec/GraphNodePlaceholders.js', 'public/nodec/placeholders/a.js',
    'src/decompiled/a.js', 'src/a.DLL', 'src/a.EXE', 'src/a.cpp', 'src/a.cs', 'src/a.3dm',
    'src/a.step', 'src/a.obj', 'src/a.zip', 'src/.env', 'src/node_modules/a.js',
    MANIFEST, LOG
  ]
  for (const name of names) {
    put(f.sourceRoot, name, 'not for export')
    refusesWithoutWrites(f, () => f.run(['src/file.js', name], { allowAdapted: true }), /Blacklisted|allowlist/)
  }
})

test('reviewed STEP files and sync tooling are allowed; AGENTS requires explicit adaptation consent', t => {
  const f = fixture(t)
  const files = [
    'scripts/test-step-part21.cjs', 'scripts/test-step-progressive.cjs',
    'scripts/test-step-progressive-browser.cjs', 'scripts/test-cad-frontend-import.js',
    'docs/STEP_IMPORT.md', 'docs/FRONTEND_SYNC.md', 'scripts/sync-frontend-export.cjs',
    'scripts/test-sync-frontend-export.cjs', 'src/PandaUIApp.js'
  ]
  for (const file of files) f.add(file)
  assert.equal(f.run(files).files.length, files.length)
  put(f.sourceRoot, 'AGENTS.md', 'Original sync policy')
  put(f.targetRoot, 'AGENTS.md', 'Tailored frontend policy')
  refusesWithoutWrites(f, () => f.run(['AGENTS.md']), /adaptation protected/)
  assert.equal(f.run(['AGENTS.md'], { allowAdapted: true }).status, 'synced')
  assert.equal(f.read(f.targetRoot, 'AGENTS.md'), 'Original sync policy')
  assert.ok(f.read(f.targetRoot, LOG).includes(hash('Tailored frontend policy')))
})

test('invalid paths, directories, absent files and case aliases never create files', t => {
  const f = fixture(t)
  f.add('src/file.js')
  for (const name of ['../outside', '/absolute', 'C:\\outside', '\\\\host\\share', 'src/../file.js', './src/file.js',
    'src//file.js', 'src/file.js:stream', 'src/*.js', 'src/CON.txt', 'src/file.js.', 'src/file.js ', 'src/a\n.js', 'src/', 'src', 'src/missing.js']) {
    refusesWithoutWrites(f, () => f.run(['src/file.js', name]), /relative path|allowlist|Missing file/)
  }
  refusesWithoutWrites(f, () => f.run(['src/file.js', 'src/FILE.js']), /Aliased/)
  refusesWithoutWrites(f, () => f.run([], { message: 'x' }), /explicit/)
  refusesWithoutWrites(f, () => f.run(undefined, { message: '  ' }), /message/)
  fs.mkdirSync(path.join(f.sourceRoot, 'src/directory'))
  refusesWithoutWrites(f, () => f.run(['src/directory']), /regular file/)
  assert.equal(f.run(['src\\file.js']).status, 'synced')
})

test('malformed, duplicate, and escaping manifest mappings fail closed', t => {
  for (const corrupt of [
    m => { m.copied[0].exportSha256 = 'invalid' },
    m => { m.copied[0].destination = '../outside' },
    m => { m.copied[0].source = '../outside' },
    m => { m.copied.push({ ...m.copied[0] }) },
    m => { m.copied[0].destination = 'src/elsewhere.js' },
    m => { m.adaptations = 'src/file.js' }
  ]) {
    const f = fixture(t)
    f.add('src/file.js')
    corrupt(f.manifest)
    f.save()
    refusesWithoutWrites(f, () => f.run(), /manifest|relative path/i)
  }
  const f = fixture(t)
  f.add('src/file.js')
  put(f.targetRoot, MANIFEST, '{')
  refusesWithoutWrites(f, () => f.run(), /Invalid JSON/)
})

test('missing manifest, log divergence/tampering and stale locks refuse without writes', t => {
  for (const mode of ['missing manifest', 'one log', 'diverged logs', 'both tampered', 'lock']) {
    const f = fixture(t)
    f.add('src/file.js')
    if (mode === 'missing manifest') fs.unlinkSync(path.join(f.targetRoot, MANIFEST))
    if (mode === 'one log') put(f.sourceRoot, LOG, 'manual history')
    if (mode === 'diverged logs') { put(f.sourceRoot, LOG, 'first'); put(f.targetRoot, LOG, 'second') }
    if (mode === 'both tampered') {
      f.run()
      put(f.sourceRoot, LOG, 'tampered')
      put(f.targetRoot, LOG, 'tampered')
    }
    if (mode === 'lock') put(f.targetRoot, 'docs/.frontend-sync.lock', 'previous run')
    refusesWithoutWrites(f, () => f.run(), /Missing file|log conflict|lock exists/)
  }
})

test('directory symlinks/junctions in either repository and metadata paths are rejected', t => {
  for (const location of ['source', 'target', 'source-docs', 'target-docs', 'source-root', 'target-root']) {
    const f = fixture(t)
    f.add('src/file.js')
    const outside = path.join(f.base, 'outside')
    fs.mkdirSync(outside)
    put(outside, 'secret.js', 'private')
    const root = location.startsWith('source') ? f.sourceRoot : f.targetRoot
    let link
    if (location.endsWith('root')) {
      link = path.join(f.base, location + '-link')
      fs.symlinkSync(root, link, process.platform === 'win32' ? 'junction' : 'dir')
      refusesWithoutWrites(f, () => f.run(undefined, location.startsWith('source') ? { sourceRoot: link } : { targetRoot: link }), /Symlink/)
      continue
    }
    if (location.endsWith('docs')) {
      link = path.join(root, 'docs')
      if (fs.existsSync(link)) fs.renameSync(link, path.join(f.base, 'old-docs'))
    } else link = path.join(root, 'src/link')
    if (location === 'target') put(f.sourceRoot, 'src/link/secret.js', 'source content')
    fs.symlinkSync(outside, link, process.platform === 'win32' ? 'junction' : 'dir')
    refusesWithoutWrites(f, () => f.run(location.endsWith('docs') ? undefined : ['src/file.js', 'src/link/secret.js']), /Symlink/)
  }
})

test('file and dangling symlinks are rejected where supported', t => {
  const f = fixture(t)
  f.add('src/file.js')
  try { fs.symlinkSync(path.join(f.base, 'absent'), path.join(f.sourceRoot, 'src/link.js'), 'file') } catch (error) {
    if (['EPERM', 'EACCES'].includes(error.code)) { t.skip('Host does not permit file symlink creation'); return }
    throw error
  }
  refusesWithoutWrites(f, () => f.run(['src/link.js']), /Symlink/)
})

test('staging errors and mid-commit errors restore content and remove temporary files', t => {
  for (const operation of ['writeFileSync', 'renameSync']) {
    const f = fixture(t)
    f.add('src/file.js')
    put(f.sourceRoot, 'public/shared/new.js', 'new file')
    const before = snapshot(f.base).map(row => row.slice(0, 2))
    const original = fs[operation]
    let calls = 0
    fs[operation] = function (...args) {
      // Staging: lock + two payloads then fail. Commit: replace both payloads,
      // write the source log, then fail on the target log.
      if (++calls === 4) throw Object.assign(new Error('Injected I/O failure'), { code: 'EIO' })
      return original.apply(this, args)
    }
    try { assert.throws(() => f.run(['src/file.js', 'public/shared/new.js']), /Injected I\/O failure/) } finally { fs[operation] = original }
    assert.deepEqual(snapshot(f.base).map(row => row.slice(0, 2)), before)
    assert.equal(f.run(['src/file.js', 'public/shared/new.js']).status, 'synced')
  }
})

test('concurrent edits detected after staging are preserved', t => {
  const f = fixture(t)
  f.add('src/file.js')
  const original = fs.fsyncSync
  let changed = false
  fs.fsyncSync = function (...args) {
    if (!changed) { changed = true; put(f.targetRoot, 'src/file.js', 'concurrent user edit') }
    return original.apply(this, args)
  }
  try { assert.throws(() => f.run(), /changed during sync/) } finally { fs.fsyncSync = original }
  assert.equal(f.read(f.targetRoot, 'src/file.js'), 'concurrent user edit')
  assert.equal(fs.existsSync(path.join(f.sourceRoot, LOG)), false)
  assert.equal(fs.existsSync(path.join(f.targetRoot, 'docs/.frontend-sync.lock')), false)
})

test('CLI uses its own repository regardless of cwd, validates options and exposes stable exit codes', t => {
  const f = fixture(t)
  f.add('src/file.js')
  const script = 'scripts/sync-frontend-export.cjs'
  put(f.sourceRoot, script, fs.readFileSync(path.join(__dirname, 'sync-frontend-export.cjs')))
  const cli = args => spawnSync(process.execPath, [path.join(f.sourceRoot, script), ...args], { cwd: os.tmpdir(), encoding: 'utf8' })
  assert.equal(cli(['--help']).status, 0)
  for (const args of [[], ['src/file.js'], ['--message'], ['--message', 'x'], ['--bogus'],
    ['--message', 'x', '--check', '--check', 'src/file.js']]) assert.equal(cli(args).status, 1)
  const args = ['--message', 'CLI test', 'src/file.js']
  const before = snapshot(f.base)
  const check = cli(['--check', ...args])
  assert.equal(check.status, 2, check.stderr)
  assert.equal(JSON.parse(check.stdout).status, 'pending')
  assert.deepEqual(snapshot(f.base), before)
  assert.equal(cli(args).status, 0)
  assert.equal(cli(['--check', ...args]).status, 0)
  put(f.targetRoot, 'src/file.js', 'user edit')
  assert.equal(cli(args).status, 1)
})
