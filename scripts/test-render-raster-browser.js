/* Standalone shader/pixel validation; no running PandaUI server is required.
 * node scripts/test-render-raster-browser.js
 * Requires webpack and playwright (or set NODE_PATH to a bundled installation).
 */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const http = require('node:http')
const os = require('node:os')
const path = require('node:path')
const webpack = require('webpack')
const { chromium } = require('playwright')

async function run () {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'test-render-raster-'))
  let browser, server
  try {
    const compiler = webpack({
      mode: 'development',
      devtool: false,
      entry: path.join(__dirname, 'test-render-raster-fixture.js'),
      output: { path: directory, filename: 'raster.js' }
    })
    await new Promise((resolve, reject) => compiler.run((error, stats) => {
      compiler.close(() => {})
      if (error || stats.hasErrors()) reject(error || new Error(stats.toString({ all: false, errors: true })))
      else resolve()
    }))
    server = http.createServer((req, res) => {
      if (req.url === '/raster.js') {
        res.setHeader('Content-Type', 'text/javascript')
        fs.createReadStream(path.join(directory, 'raster.js')).pipe(res)
      } else {
        res.setHeader('Content-Type', 'text/html')
        res.end('<!doctype html><title>Raster renderer validation</title><script src="/raster.js"></script>')
      }
    })
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    browser = await chromium.launch({ headless: true, channel: process.env.RASTER_BROWSER_CHANNEL || 'msedge', args: ['--enable-unsafe-swiftshader'] })
    const page = await browser.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => {
      if (message.type() === 'error') { errors.push(message.text()); console.error(message.text().slice(0, 600)) }
    })
    await page.goto(`http://127.0.0.1:${server.address().port}/`)
    const result = await page.evaluate(webgl1 => window.runRasterTests({ webgl1 }), process.argv.includes('--webgl1'))
    assert.deepEqual(errors, [], 'No JavaScript or WebGL shader errors')
    assert(result.checks.length > 25, 'All focused checks ran')
    const imageDirectory = path.join(__dirname, '../docs/performance/realtime-optics-20261118')
    fs.mkdirSync(imageDirectory, { recursive: true })
    fs.writeFileSync(path.join(imageDirectory, process.argv.includes('--webgl1') ? 'floor-webgl1.png' : 'floor-webgl2.png'), Buffer.from(result.studioImage.split(',')[1], 'base64'))
    fs.writeFileSync(path.join(imageDirectory, process.argv.includes('--webgl1') ? 'glass-webgl1.png' : 'glass-webgl2.png'), Buffer.from(result.glassImage.split(',')[1], 'base64'))
    fs.writeFileSync(path.join(imageDirectory, process.argv.includes('--webgl1') ? 'distance-webgl1.png' : 'distance-webgl2.png'), Buffer.from(result.distanceImage.split(',')[1], 'base64'))
    delete result.distanceImage
    fs.writeFileSync(path.join(imageDirectory, process.argv.includes('--webgl1') ? 'stack-webgl1.png' : 'stack-webgl2.png'), Buffer.from(result.stackImage.split(',')[1], 'base64'))
    delete result.stackImage
    delete result.glassImage
    delete result.studioImage
    console.log(JSON.stringify(result, null, 2))
  } finally {
    if (browser) await browser.close()
    if (server) await new Promise(resolve => server.close(resolve))
    // Only our mkdtemp directory is removed, with no cross-shell deletion.
    fs.rmSync(directory, { recursive: true, force: true })
  }
}

run().catch(error => { console.error(error); process.exitCode = 1 })
