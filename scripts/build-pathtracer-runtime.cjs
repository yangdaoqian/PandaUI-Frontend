// Build a standalone modern Three.js island. The host stays on its patched r120.
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const webpack = require('webpack')
const root = path.resolve(__dirname, '..')
const runtime = path.join(__dirname, 'pathtracer-runtime')
const modules = path.join(runtime, 'node_modules')
const output = path.join(root, 'public/shared/pathtracer')
async function main () {
  const compiler = webpack({
    mode: 'production', devtool: false, target: 'web',
    entry: path.join(runtime, 'runtime.js'),
    output: { path: output, filename: 'runtime.js', chunkFilename: '[name].[contenthash:12].js', publicPath: '/shared/pathtracer/', globalObject: 'self', library: { name: 'PandaPathTracerRuntime', type: 'var' } },
    resolve: { modules: [modules], alias: { three: path.join(modules, 'three'), 'three-mesh-bvh': path.join(modules, 'three-mesh-bvh') } },
    performance: { hints: false }
  })
  const stats = await new Promise((resolve, reject) => compiler.run((err, stats) => { compiler.close(() => {}); if (err || stats.hasErrors()) reject(err || new Error(stats.toString({ all: false, errors: true }))); else resolve(stats) }))
  const assets = stats.compilation.getAssets().map(a => a.name).sort()
  const dependencies = ['three', 'three-gpu-pathtracer', 'three-mesh-bvh'].map(name => {
    const dir = path.join(modules, name), pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json')))
    fs.writeFileSync(path.join(output, name + '-LICENSE.txt'), fs.readFileSync(path.join(dir, 'LICENSE'), 'utf8'))
    return { name, version: pkg.version, license: pkg.license, repository: pkg.repository }
  })
  fs.copyFileSync(path.join(runtime, 'glslSmartDeNoise-LICENSE.txt'), path.join(output, 'glslSmartDeNoise-LICENSE.txt'))
  fs.writeFileSync(path.join(output, 'NOTICE.txt'), 'PandaUI path-tracing runtime\nIncludes three-gpu-pathtracer 0.0.23, Three.js 0.170.0 and three-mesh-bvh 0.8.3 (MIT).\nDenoiseMaterial includes glslSmartDeNoise by Michele Morrone (BSD-2-Clause).\nFull license texts are shipped beside this file. xatlas-web is an unused peer dependency and is not bundled.\nThe runtime is built from scripts/pathtracer-runtime using scripts/build-pathtracer-runtime.cjs.\n')
  fs.writeFileSync(path.join(output, 'runtime-manifest.json'), JSON.stringify({ dependencies, denoiser: { name: 'glslSmartDeNoise', license: 'BSD-2-Clause' }, assets: assets.map(name => ({ name, sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(output, name))).digest('hex') })) }, null, 2) + '\n')
  console.log(stats.toString({ all: false, assets: true, warnings: true }))
}
main().catch(error => { console.error(error); process.exitCode = 1 })
