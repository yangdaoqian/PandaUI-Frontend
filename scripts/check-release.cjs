const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { execFileSync } = require('node:child_process')
const root = path.resolve(__dirname, '..')
const files = [...new Set(execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean))]
const problems = []
const forbidden = /^(?:server|Plugins_Main|Plugins|node_modules|dist|\.quasar|\.tools|\.codex-runtime|\.tmp|\.runtime-builds|\.runtime-logs|public\/(?:samples|materials|cubemaps|vendor)|public\/editor\/(?:plugins\/data|nodes_data))(?:\/|$)/i
const native = /\.(?:cpp|cxx|cc|c|h|hpp|hxx|cs|dll|exe|pdb|3dm|step|stp|skp)$/i
const secrets = [
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ['GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{50,})\b/],
  ['API token', /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/],
  ['AWS access key', /\bAKIA[A-Z0-9]{16}\b/],
  ['credential URL', /https?:\/\/[^\s/:'"<>]+:[^\s/@'"<>]+@/]
]
for (const name of files) {
  if (forbidden.test(name) || native.test(name) || /(?:^|\/)\.env(?:\.|$)/.test(name) && name !== '.env.example') problems.push('Excluded file: ' + name)
  const absolute = path.join(root, name)
  if (!fs.existsSync(absolute)) { problems.push('Missing tracked file: ' + name); continue }
  const stat = fs.lstatSync(absolute)
  if (stat.isSymbolicLink()) { problems.push('Symlink requires review: ' + name); continue }
  if (stat.size > 100 * 1024 * 1024) problems.push('GitHub file-size limit: ' + name)
  if (/\.(?:wasm|png|jpe?g|gif|woff2?|ico)$/i.test(name)) continue
  const text = fs.readFileSync(absolute, 'utf8')
  for (const [kind, pattern] of secrets) if (pattern.test(text)) problems.push(`${kind} pattern: ${name}`)
}
for (const required of ['LICENSE', 'LICENSE_SCOPE.md', 'THIRD_PARTY_NOTICES.md', 'public/nodec/NodeC.js', 'public/nodec/NodeC.wasm', 'public/editor/js/libs/codemirror/LICENSE', 'public/legal/npm-licenses.txt', 'public/legal/dependency-inventory.json', 'licenses/occt/LICENSE_LGPL_21.txt', 'licenses/occt/OCCT_LGPL_EXCEPTION.txt', 'docs/OCCT_RUNTIME.md']) {
  if (!files.includes(required)) problems.push('Required release file missing or ignored: ' + required)
}
const inventory = JSON.parse(fs.readFileSync(path.join(root, 'public/legal/dependency-inventory.json'), 'utf8'))
for (const dependency of inventory.packages) {
  if (dependency.license === 'UNKNOWN') problems.push('Unknown dependency license: ' + dependency.name)
  if (dependency.runtimeDependency && !dependency.notices.length) problems.push('Production dependency notice missing: ' + dependency.name)
}
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'docs/EXPORT_MANIFEST.json'), 'utf8'))
for (const entry of manifest.copied) {
  const data = fs.readFileSync(path.join(root, entry.destination))
  if (crypto.createHash('sha256').update(data).digest('hex') !== entry.exportSha256) problems.push('Export hash changed: ' + entry.destination)
}
if (problems.length) { console.error(problems.join('\n')); process.exitCode = 1 } else {
  console.log(`PASS: ${files.length} candidate files; required notices, runtime files, dependency inventory and export hashes checked.`)
  console.log('Meshing/curve-sampling provenance review is deferred by maintainer instruction. This technical check is not legal clearance or a comprehensive secret audit.')
}
