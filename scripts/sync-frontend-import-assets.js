const fs = require('fs')
const path = require('path')

// Serve WASM locally in development and production; never depend on a CDN.
function syncFrontendImportAssets () {
  const source = process.env.PANDAUI_OCCT_RUNTIME_DIR
    ? path.resolve(process.env.PANDAUI_OCCT_RUNTIME_DIR)
    : path.dirname(require.resolve('occt-import-js'))
  const target = path.resolve(__dirname, '../public/vendor/occt')
  fs.mkdirSync(target, { recursive: true })
  for (const name of ['occt-import-js.js', 'occt-import-js.wasm', 'license.occt-import-js.txt', 'license.occt.txt']) {
    const from = path.join(source, name), to = path.join(target, name)
    if (!fs.existsSync(from)) throw new Error('Missing OCCT runtime file: ' + from)
    if (!fs.existsSync(to) || !fs.readFileSync(from).equals(fs.readFileSync(to))) fs.copyFileSync(from, to)
  }
  const worker = 'occt-import-js-worker.js'
  if (fs.existsSync(path.join(source, worker))) fs.copyFileSync(path.join(source, worker), path.join(target, worker))
  fs.copyFileSync(path.resolve(__dirname, '../licenses/occt/OCCT_LGPL_EXCEPTION.txt'), path.join(target, 'OCCT_LGPL_EXCEPTION.txt'))
  const legal = path.resolve(__dirname, '../public/legal')
  fs.mkdirSync(legal, { recursive: true })
  for (const name of ['LICENSE', 'LICENSE_SCOPE.md', 'THIRD_PARTY_NOTICES.md']) {
    fs.copyFileSync(path.resolve(__dirname, '..', name), path.join(legal, name))
  }
  fs.copyFileSync(path.resolve(__dirname, '../docs/OCCT_RUNTIME.md'), path.join(legal, 'OCCT_RUNTIME.md'))
  for (const name of ['roboto-font.txt', 'material-icons.txt', 'material-icons-outlined.txt']) {
    fs.copyFileSync(path.resolve(__dirname, '../licenses', name), path.join(legal, name))
  }
}

module.exports = syncFrontendImportAssets
if (require.main === module) syncFrontendImportAssets()
