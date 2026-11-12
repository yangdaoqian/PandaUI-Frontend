// Rebuild the installed-dependency inventory without embedding local paths.
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const root = path.resolve(__dirname, '..')
const output = path.join(root, 'public/legal')
const records = new Map()
const digest = data => crypto.createHash('sha256').update(data).digest('hex')
const supplementalFile = path.join(root, 'licenses/supplemental-sources.json')
const supplemental = fs.existsSync(supplementalFile) ? JSON.parse(fs.readFileSync(supplementalFile, 'utf8').replace(/^\uFEFF/, '')) : []
const runtimePackages = new Set()
function markRuntime (from, name) {
  let current = from
  while (current.startsWith(root)) {
    const folder = path.join(current, 'node_modules', name)
    if (fs.existsSync(path.join(folder, 'package.json'))) {
      const pkg = JSON.parse(fs.readFileSync(path.join(folder, 'package.json'), 'utf8'))
      const key = `${pkg.name}@${pkg.version}`
      if (runtimePackages.has(key)) return
      runtimePackages.add(key)
      for (const dependency of Object.keys({ ...pkg.dependencies, ...pkg.optionalDependencies, ...pkg.peerDependencies })) markRuntime(folder, dependency)
      return
    }
    const parent = path.dirname(current)
    if (parent === current) return
    current = parent
  }
}
for (const name of Object.keys(require(path.join(root, 'package.json')).dependencies)) markRuntime(root, name)

function visit (modules) {
  if (!fs.existsSync(modules)) return
  for (const entry of fs.readdirSync(modules, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue
    const folder = path.join(modules, entry.name)
    if (entry.name.startsWith('@')) {
      for (const child of fs.readdirSync(folder, { withFileTypes: true })) if (child.isDirectory()) readPackage(path.join(folder, child.name))
    } else readPackage(folder)
  }
}

function readPackage (folder) {
  const manifest = path.join(folder, 'package.json')
  if (!fs.existsSync(manifest)) return
  const pkg = JSON.parse(fs.readFileSync(manifest, 'utf8'))
  const key = `${pkg.name}@${pkg.version}`
  if (!records.has(key)) {
    const notices = []
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      if (entry.isFile() && /^(licen[cs]e|copying|notice|copyright|authors)([._-]|$)/i.test(entry.name)) {
        const content = fs.readFileSync(path.join(folder, entry.name), 'utf8')
        notices.push({ file: entry.name, sha256: digest(content), content })
      }
    }
    const license = typeof pkg.license === 'object' ? pkg.license.type : pkg.license || (pkg.licenses || []).map(item => item.type).join(' OR ') || 'UNKNOWN'
    // Some older packages put the complete notice only in their README.
    if (!notices.length) {
      const readme = fs.readdirSync(folder).find(name => /^readme(?:\.md|\.markdown|\.txt)?$/i.test(name))
      if (readme) {
        const content = fs.readFileSync(path.join(folder, readme), 'utf8')
        const heading = /(?:^|\n)#{1,4}\s*(?:licen[cs]e|copyright)[^\n]*\n/i.exec(content)
        if (heading) {
          const section = content.slice(heading.index).trim()
          notices.push({ file: readme + '#license', sha256: digest(section), content: section })
        }
      }
    }
    const extra = supplemental.find(p => p.name === pkg.name && p.version === pkg.version)
    if (!notices.length && extra) {
      const content = fs.readFileSync(path.join(root, extra.path), 'utf8')
      if (digest(content) !== extra.sha256) throw new Error('Supplemental license hash mismatch: ' + key)
      notices.push({ file: extra.path, sha256: extra.sha256, source: extra.source, versionMatched: extra.versionMatched, content })
    }
    records.set(key, { name: pkg.name, version: pkg.version, license, runtimeDependency: runtimePackages.has(key), homepage: pkg.homepage || null, repository: typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url || null, notices })
  }
  visit(path.join(folder, 'node_modules'))
}

visit(path.join(root, 'node_modules'))
if (!records.size) throw new Error('Install the locked dependencies before generating notices.')
const packages = [...records.values()].sort((a, b) => `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`))
fs.mkdirSync(output, { recursive: true })
const inventory = { schemaVersion: 1, scope: 'Installed production and development dependencies; not every package is shipped to the browser.', packages: packages.map(({ notices, ...pkg }) => ({ ...pkg, notices: notices.map(({ content, ...notice }) => notice) })) }
fs.writeFileSync(path.join(output, 'dependency-inventory.json'), JSON.stringify(inventory, null, 2) + '\n')
fs.writeFileSync(path.join(output, 'npm-licenses.txt'), packages.map(pkg => [
  '='.repeat(72), `${pkg.name}@${pkg.version}`, `Declared license: ${pkg.license}`, `Dependency scope: ${pkg.runtimeDependency ? 'production' : 'development/build'}`,
  `Source: ${pkg.repository || pkg.homepage || 'https://www.npmjs.com/package/' + pkg.name}`,
  ...pkg.notices.map(notice => `\n--- ${notice.file} ---\n${notice.content}`),
  ...(pkg.notices.length ? [] : ['No bundled notice text found; see the dependency inventory and upstream source.'])
].join('\n')).join('\n\n') + '\n')
console.log(JSON.stringify({ packages: packages.length, unknownLicense: packages.filter(p => p.license === 'UNKNOWN').map(p => p.name), withoutNotice: packages.filter(p => !p.notices.length).map(p => `${p.name}@${p.version}`) }))
